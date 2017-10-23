var express = require('express');
var oracledb = require('oracledb');
var promise = require('bluebird');

var authorization = require('../middleware/authorization');
var database = require('../middleware/database');
var errors = require('../middleware/errors');

var router = express.Router();

router.post('/api/v1/project_application', authorization.authorize(), function(request, response, next) {
    var connection;
    var statement = {
        'sql': 'BEGIN ' +
               'INSERT INTO PROJECTAPPLICATION ' +
               'VALUES (:inProjectId, :inApplicationId) ' +
               'RETURNING PROJECTID, APPLICATIONID INTO :outProjectId, :outApplicationId;' +
               'INSERT INTO DECISION(APPLICATIONID, PROJECTID) ' +
               'VALUES (:inApplicationId, :inProjectId);' +
               'INSERT INTO GRAPHVERTEX ' +
               'SELECT g.GRAPHID, v.VERTEXID ' +
               'FROM GRAPH g JOIN PROJECTAPPLICATION pa ON g.PROJECTID = pa.PROJECTID ' +
               'JOIN VERTEX v ON v.APPLICATIONID = pa.APPLICATIONID ' +
               'WHERE g.PROJECTID = :inProjectId AND v.APPLICATIONID = :inApplicationId;' +
               'UPDATE GRAPH ' +
               'SET LASTMODIFIEDAT = SYSTIMESTAMP ' +
               'WHERE PROJECTID = :inProjectId;' +
               'END;',
        'binds': { 
            inProjectId: request.body.project_id,
            inApplicationId: request.body.application_id,
            outProjectId: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT },
            outApplicationId: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT } 
        }
    }

    database.connect()
    .then(function(connection) {
        this.connection = connection;
        return database.executeStatement(connection, statement);
    })
    .then(function(result) {
        if (result.outBinds.outProjectId != undefined)
            return database.commit(this.connection);
        else
            next(new errors.BadRequestError("There was an error while creating relationship for the given application id and project id"));
    })
    .then(function() {
        database.closeConnection(this.connection);
        response.status(201).send();
    })
    .catch(errors.InternalServerError, function(error) {
        next(error);
    })
    .catch(function(error) {
        database.closeConnection(this.connection);
        next(error);
    })
});

router.post('/api/v1/project_application/batch', authorization.authorize(), function(request, response, next) {
    var connection;
    var ids;
    var executionPromises = [];
    var statement = {
        'sql': 'BEGIN ' +
               'INSERT INTO PROJECTAPPLICATION ' +
               'VALUES (:inProjectId, :inApplicationId) ' + 
               'RETURNING PROJECTID, APPLICATIONID ' +
               'INTO :outProjectId, :outApplicationId;' +
               'INSERT INTO DECISION(APPLICATIONID, PROJECTID) ' +
               'VALUES (:inApplicationId, :inProjectId);' +
               'INSERT INTO GRAPHVERTEX ' +
               'SELECT g.GRAPHID, v.VERTEXID ' +
               'FROM GRAPH g JOIN PROJECTAPPLICATION pa ON g.PROJECTID = pa.PROJECTID ' +
               'JOIN VERTEX v ON v.APPLICATIONID = pa.APPLICATIONID ' +
               'WHERE g.PROJECTID = :inProjectId AND v.APPLICATIONID = :inApplicationId;' +
               'UPDATE GRAPH ' +
               'SET LASTMODIFIEDAT = SYSTIMESTAMP ' +
               'WHERE PROJECTID = :inProjectId;' +
               'END;',
        'options': { outFormat: oracledb.OBJECT }
    }

    database.connect()
    .then(function(connection) {
        this.connection = connection;
        request.body.forEach(function(projectApplication) {
            statement.binds = { 
                inProjectId: projectApplication.project_id,
                inApplicationId: projectApplication.application_id,
                outProjectId: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT },
                outApplicationId: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT }
            }
            executionPromises.push(database.executeStatement(connection, statement));
        });

        return promise.all(executionPromises.map(function(promise) {
            return promise.reflect();
        }))
    })
    .filter(function(promise) {
        return promise.isFulfilled();
    })
    .then(function(results) {
        var ids = [];
        results.forEach(function(result) {
            ids.push({
                'PROJECTID': result.value().outBinds.outProjectId,
                'APPLICATIONID': result.value().outBinds.outApplicationId
            });
        });

        this.ids = ids;
        if (ids.length > 0)
            return database.commit(this.connection);
        else
            next(new errors.BadRequestError());
    })
    .then(function() {
        database.closeConnection(this.connection);
        response.status(201).json(this.ids);
    })
    .catch(errors.InternalServerError, function(error) {
        next(error);
    })
    .catch(function(error) {
        database.closeConnection(this.connection);
        next(error);
    })
});

router.delete('/api/v1/project_application', authorization.authorize(), function(request, response, next) {
    var connection;
    var warning;
    var statement = {
        'sql': 'DELETE ' +
               'FROM PROJECTAPPLICATION ' +
               'WHERE APPLICATIONID = :inApplicationId AND PROJECTID = :inProjectId',
        'binds': { 
            inApplicationId: request.body.application_id,
            inProjectId: request.body.project_id 
        },
        'options': { outFormat: oracledb.OBJECT }
    }

    database.connect()
    .then(function(connection) {
        this.connection = connection;
        return database.executeStatement(connection, statement);
    })
    .then(function(result) {
        if (result.rowsAffected == 0)
            this.warning = 'Relationship not found for the given application id and project id';

        statement = {
            'sql': 'DELETE FROM DECISION ' +
                   'WHERE APPLICATIONID = :inApplicationId AND PROJECTID = :inProjectId',
            'binds': { 
                inApplicationId: request.body.application_id,
                inProjectId: request.body.project_id
            }
        }

        return database.executeStatement(this.connection, statement);
    })
    .then(function(result) {
        statement.sql = 'DELETE FROM GRAPHEDGE ' +
                        'WHERE (GRAPHID, VERTEXFROMID, VERTEXTOID) IN ' +
                        '   (SELECT g.GRAPHID, ge.VERTEXFROMID, ge.VERTEXTOID ' +
                        '    FROM GRAPH g JOIN GRAPHEDGE ge ON g.GRAPHID = ge.GRAPHID ' +
                        '    JOIN VERTEX v ON ge.VERTEXFROMID = v.VERTEXID ' +
                        '    WHERE g.PROJECTID = :inProjectId AND v.APPLICATIONID = :inApplicationId ' +
                        '    UNION ' +
                        '    SELECT g.GRAPHID, ge.VERTEXFROMID, ge.VERTEXTOID ' +
                        '    FROM GRAPH g JOIN GRAPHEDGE ge ON g.GRAPHID = ge.GRAPHID ' +
                        '    JOIN VERTEX v ON ge.VERTEXTOID = v.VERTEXID ' +
                        '    WHERE g.PROJECTID = :inProjectId AND v.APPLICATIONID = :inApplicationId)';
        return database.executeStatement(this.connection, statement);
    })
    .then(function(result) {
        statement.sql = 'DELETE FROM GRAPHVERTEX ' +
                        'WHERE (GRAPHID, VERTEXID) IN ' +
                        '   (SELECT g.GRAPHID, v.VERTEXID ' +
                        '    FROM GRAPH g JOIN GRAPHVERTEX gv ON g.GRAPHID = gv.GRAPHID ' +
                        '    JOIN VERTEX v ON gv.VERTEXID = v.VERTEXID ' +
                        '    WHERE g.PROJECTID = :inProjectId AND v.APPLICATIONID = :inApplicationId)';
        return database.executeStatement(this.connection, statement);
    })
    .then(function(result) {
        statement.sql = 'UPDATE GRAPH ' +
                        'SET LASTMODIFIEDAT = SYSTIMESTAMP ' +
                        'WHERE PROJECTID = :inProjectId';
        statement.binds = {
            inProjectId: request.body.project_id
        }
        return database.executeStatement(this.connection, statement);
    })
    .then(function(result) {
        return database.commit(this.connection);
    })
    .then(function() {
        database.closeConnection(this.connection);

        if (this.warning == null)
            response.status(204).send();
        else {
            response.status(201).json({
                WARNING: this.warning
            });
        }    
    })
    .catch(errors.InternalServerError, function(error) {
        next(error);
    })
    .catch(function(error) {
        database.closeConnection(this.connection);
        next(error);
    })
});

module.exports = router;