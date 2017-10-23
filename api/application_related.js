var express = require('express');
var oracledb = require('oracledb');
var promise = require('bluebird');

var authorization = require('../middleware/authorization');
var database = require('../middleware/database');
var errors = require('../middleware/errors');

var router = express.Router();

router.get('/api/v1/application_related', authorization.authorize(), function(request, response, next) {
    var statement = {
        'sql': 'SELECT APPLICATIONTOID ' +
               'FROM APPLICATIONRELATED ' +
               'WHERE APPLICATIONFROMID = :inApplicationIdFrom AND PROJECTID = :inProjectId',
        'binds': { 
            inApplicationIdFrom: request.query.application_id_from,
            inProjectId: request.query.project_id
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

router.post('/api/v1/application_related/batch', authorization.authorize(), function(request, response, next) {
    var connection;
    var executionPromises = [];
    var statement = {
        'sql': 'BEGIN ' +
               'INSERT INTO APPLICATIONRELATED ' +
               'VALUES (:inApplicationIdFrom, :inApplicationIdTo, :inProjectId) ' + 
               'RETURNING APPLICATIONFROMID, APPLICATIONTOID, PROJECTID ' +
               'INTO :outApplicationIdFrom, :outApplicationIdTo, :outProjectId;' +
               'INSERT INTO GRAPHEDGE(GRAPHID, VERTEXFROMID, VERTEXTOID) ' +
               'SELECT g.GRAPHID, v1.VERTEXID, v2.VERTEXID ' +
               'FROM GRAPH g JOIN APPLICATIONRELATED ar ON g.PROJECTID = ar.PROJECTID ' +
               'JOIN VERTEX v1 ON v1.APPLICATIONID = ar.APPLICATIONFROMID ' +
               'JOIN VERTEX v2 ON v2.APPLICATIONID = ar.APPLICATIONTOID ' +
               'WHERE g.PROJECTID = :inProjectId AND ar.APPLICATIONFROMID = :inApplicationIdFrom ' +
               'AND ar.APPLICATIONTOID = :inApplicationIdTo;' +
               'UPDATE GRAPH ' +
               'SET LASTMODIFIEDAT = SYSTIMESTAMP ' +
               'WHERE PROJECTID = :inProjectId;' +
               'END;',
        'options': { outFormat: oracledb.OBJECT }
    }

    database.connect()
    .then(function(connection) {
        this.connection = connection;
        request.body.forEach(function(applicationRelated) {
            statement.binds = { 
                inApplicationIdFrom: applicationRelated.application_id_from,
                inApplicationIdTo: applicationRelated.application_id_to,
                inProjectId: applicationRelated.project_id,
                outApplicationIdFrom: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT },
                outApplicationIdTo: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT },
                outProjectId: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT }
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
        var successCounter = 0;
        
        results.forEach(function(result) {
            if (result.value().outBinds.outProjectId != undefined)
                successCounter++;
        });

        if (successCounter > 0)
            return database.commit(this.connection);
        else
            next(new errors.BadRequestError());
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

router.delete('/api/v1/application_related/batch', authorization.authorize(), function(request, response, next) {
    var connection;
    var executionPromises = [];
    var statement = {
        'sql': 'DELETE ' +
               'FROM APPLICATIONRELATED ' + 
               'WHERE APPLICATIONFROMID = :inApplicationIdFrom AND APPLICATIONTOID = :inApplicationIdTo ' +
               'AND PROJECTID = :inProjectId ' +
               'RETURNING APPLICATIONFROMID, APPLICATIONTOID, PROJECTID ' + 
               'INTO :outApplicationIdFrom, :outApplicationIdTo, :outProjectId',
        'options': { outFormat: oracledb.OBJECT }
    }

    database.connect()
    .then(function(connection) {
        this.connection = connection;
        request.body.forEach(function(applicationRelated) {
            statement.binds = { 
                inApplicationIdFrom: applicationRelated.application_id_from,
                inApplicationIdTo: applicationRelated.application_id_to,
                inProjectId: applicationRelated.project_id,
                outApplicationIdFrom: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT },
                outApplicationIdTo: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT },
                outProjectId: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT }
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
        executionPromises = [];

        results.forEach(function(result) {
            statement.sql = 'BEGIN ' +
                            'DELETE FROM GRAPHEDGE ' +
                            'WHERE (VERTEXFROMID, VERTEXTOID, GRAPHID) IN ' +
                            '(SELECT ge.* ' +
                            'FROM GRAPHEDGE ge JOIN GRAPH g ON ge.GRAPHID = g.GRAPHID ' +
                            'JOIN VERTEX v1 ON ge.VERTEXFROMID = v1.VERTEXID ' +
                            'JOIN VERTEX v2 ON ge.VERTEXTOID = v2.VERTEXID ' +
                            'WHERE g.PROJECTID = :inProjectId AND v1.APPLICATIONID = :inApplicationIdFrom ' +
                            'AND v2.APPLICATIONID = :inApplicationIdTo);' +
                            'UPDATE GRAPH ' +
                            'SET LASTMODIFIEDAT = SYSTIMESTAMP ' +
                            'WHERE PROJECTID = :inProjectId;' +
                            'END;',
            statement.binds = {
                inProjectId: result.value().outBinds.outProjectId[0],
                inApplicationIdFrom: result.value().outBinds.outApplicationIdFrom[0],
                inApplicationIdTo: result.value().outBinds.outApplicationIdTo[0]
            };
            executionPromises.push(database.executeStatement(this.connection, statement));
        });

        return promise.all(executionPromises.map(function(promise) {
            return promise.reflect();
        }))
    })
    .filter(function(promise) {
        return promise.isFulfilled();
    })
    .then(function(results) {
        return database.commit(this.connection);
    })
    .then(function() {
        database.closeConnection(this.connection);
        response.status(204).send();
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