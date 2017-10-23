var express = require('express');
var oracledb = require('oracledb');

var authorization = require('../middleware/authorization');
var database = require('../middleware/database');
var errors = require('../middleware/errors');

var router = express.Router();

router.get('/api/v1/project', authorization.authorize(), function(request, response, next) {
    var statement = {
        'sql': 'SELECT * FROM PROJECT ' +
               'WHERE USERID = :inUserId',
        'binds': { 
            inUserId: request.query.user_id
        },
        'options': { outFormat: oracledb.OBJECT }
    }

    database.fullExecuteStatement(statement)
    .then(function(result) {
        response.status(200).json(result.rows);
    })
    .catch(function(error) {
        next(error)
    })
});

router.post('/api/v1/project', authorization.authorize(), function(request, response, next) {
    var connection;
    var result;
    var statement = {
        'sql': 'INSERT INTO PROJECT (NAME, DESCRIPTION, USERID) ' +
               'VALUES (:inName, :inDescription, :inUserId) ' + 
               'RETURNING PROJECTID, NAME, DESCRIPTION ' +
               'INTO :outId, :outName, :outDescription',
        'binds': { 
            inName: request.body.name,
            inDescription: request.body.description,
            inUserId: request.body.user_id,
            outId: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT },
            outName: { type: oracledb.STRING, dir: oracledb.BIND_OUT },
            outDescription: { type: oracledb.STRING, dir: oracledb.BIND_OUT }    
        },
        'options': { outFormat: oracledb.OBJECT }
    }

    database.connect()
    .then(function(connection) {
        this.connection = connection;
        return database.executeStatement(connection, statement);
    })
    .then(function(result) {
        this.result = result;

        statement.sql = 'INSERT INTO GRAPH(PROJECTID) ' +
                        'VALUES (:inProjectId)';
        statement.binds = {
            inProjectId: this.result.outBinds.outId[0]
        };
        return database.executeStatement(this.connection, statement);
    })
    .then(function(result) {
        statement.sql = 'INSERT INTO WEIGHTINGPARAMETERS(PROJECTID) ' +
                        'VALUES (:inProjectId)';
        return database.executeStatement(this.connection, statement);
    })
    .then(function(result) {
        statement.sql = 'INSERT INTO PROJECTCRITERIANAME(PROJECTID, CRITERIANAMEID) ' +
                        'SELECT :inProjectId AS PROJECTID, CRITERIANAMEID ' +
                        'FROM CRITERIANAME';
        return database.executeStatement(this.connection, statement);
    })
    .then(function(result) {
        if (result.rowsAffected > 0)
            return database.commit(this.connection);
        else
            next(new errors.BadRequestError("There was an error while creating the project"));
    })
    .then(function() {
        database.closeConnection(this.connection);

        response.status(201).json({
            PROJECTID: this.result.outBinds.outId[0],
            NAME: this.result.outBinds.outName[0],
            DESCRIPTION: this.result.outBinds.outDescription[0]
        });
    })
    .catch(errors.InternalServerError, function(error) {
        next(error);
    })
    .catch(function(error) {
        database.closeConnection(this.connection);
        next(error);
    })
});

router.post('/api/v1/project/batch', authorization.authorize(), function(request, response, next) {
    var connection;
    var result;
    var statement = {
        'sql': 'BEGIN ' +
               'COPY_PROJECT(:inProjectIdFrom, :inName, :inDescription, :inUserId, ' +
               '             :outId, :outName, :outDescription); ' +
               'END;',
        'binds': { 
            inProjectIdFrom: request.body.project_id_from,
            inName: request.body.name,
            inDescription: request.body.description,
            inUserId: request.body.user_id,
            outId: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT },
            outName: { type: oracledb.STRING, dir: oracledb.BIND_OUT },
            outDescription: { type: oracledb.STRING, dir: oracledb.BIND_OUT }    
        }
    }

    database.connect()
    .then(function(connection) {
        this.connection = connection;
        return database.executeStatement(connection, statement);
    })
    .then(function(result) {
        this.result = result;

        statement.sql = 'INSERT INTO GRAPH(PROJECTID) ' +
                        'VALUES (:inProjectId)';
        statement.binds = {
            inProjectId: this.result.outBinds.outId
        };

        return database.executeStatement(this.connection, statement);
    })
    .then(function(result) {
        if (result.rowsAffected > 0)
            return database.commit(this.connection);
        else
            next(new errors.BadRequestError("There was an error while creating the corresponding graph"));
    })
    .then(function() {
        database.closeConnection(this.connection);

        response.status(201).json({
            PROJECTID: this.result.outBinds.outId,
            NAME: this.result.outBinds.outName,
            DESCRIPTION: this.result.outBinds.outDescription
        });
    })
    .catch(errors.InternalServerError, function(error) {
        next(error);
    })
    .catch(function(error) {
        database.closeConnection(this.connection);
        next(error);
    })
});

router.delete('/api/v1/project/:project_id', authorization.authorize(), function(request, response, next) {
    var statement = {
        'sql': 'DELETE ' +
               'FROM PROJECT ' +
               'WHERE PROJECTID = :inProjectId',
        'binds': { 
            inProjectId: request.params.project_id   
        },
        'options': { outFormat: oracledb.OBJECT }
    }

    database.fullExecuteStatement(statement)
    .then(function(result) {
        if (result.rowsAffected > 0)
            response.status(204).send();
        else {
            response.status(201).json({
                WARNING: 'Project not found for the given project id'
            });
        }
    })
    .catch(function(error) {
        next(error)
    })
});

module.exports = router;