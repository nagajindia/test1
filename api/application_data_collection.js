var express = require('express');
var oracledb = require('oracledb');
var promise = require('bluebird');

var authorization = require('../middleware/authorization');
var database = require('../middleware/database');
var errors = require('../middleware/errors');

var router = express.Router();

router.get('/api/v1/application_data_collection', authorization.authorize(), function(request, response, next) {
    var statement = {
        'sql': 'SELECT DATACOLLECTIONID, VALUE ' +
               'FROM APPLICATIONDATACOLLECTION ' +
               'WHERE APPLICATIONID = :inApplicationId AND PROJECTID = :inProjectId ' +
               'ORDER BY DATACOLLECTIONID ASC',
        'binds': { 
            inApplicationId: request.query.application_id,
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

router.post('/api/v1/application_data_collection/batch', authorization.authorize(), function(request, response, next) {
    var connection;
    var ids;
    var executionPromises = [];
    var statement = {
        'sql': 'INSERT INTO APPLICATIONDATACOLLECTION(APPLICATIONID, DATACOLLECTIONID, VALUE, PROJECTID) ' +
               'VALUES (:inApplicationId, :inDataCollectionId, :inValue, :inProjectId) ' + 
               'RETURNING APPLICATIONID, DATACOLLECTIONID, VALUE, PROJECTID ' +
               'INTO :outApplicationId, :outDataCollectionId, :outValue, :outProjectId',
        'options': { outFormat: oracledb.OBJECT }
    }

    database.connect()
    .then(function(connection) {
        this.connection = connection;
        request.body.forEach(function(applicationDataCollection) {
            statement.binds = { 
                inApplicationId: applicationDataCollection.application_id,
                inDataCollectionId: applicationDataCollection.data_collection_id,
                inValue: applicationDataCollection.value,
                inProjectId: applicationDataCollection.project_id,
                outApplicationId: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT },
                outDataCollectionId: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT },
                outValue: { type: oracledb.STRING, dir: oracledb.BIND_OUT },
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
        var ids = [];
        results.forEach(function(result) {
            ids.push({
                'APPLICATIONID': result.value().outBinds.outApplicationId[0],
                'DATACOLLECTIONID': result.value().outBinds.outDataCollectionId[0],
                'VALUE': result.value().outBinds.outValue[0],
                'PROJECTID': result.value().outBinds.outProjectId[0]
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

router.put('/api/v1/application_data_collection/batch', authorization.authorize(), function(request, response, next) {
    var connection;
    var ids;
    var executionPromises = [];
    var statement = {
        'sql': 'UPDATE APPLICATIONDATACOLLECTION ' +
               'SET VALUE = :inValue, ' +
               'CREATEDAT = SYSTIMESTAMP ' +  
               'WHERE APPLICATIONID = :inApplicationId AND PROJECTID = :inProjectId ' +
               'AND DATACOLLECTIONID = :inDataCollectionId ' +
               'RETURNING APPLICATIONID, DATACOLLECTIONID, VALUE, PROJECTID ' + 
               'INTO :outApplicationId, :outDataCollectionId, :outValue, :outProjectId',
        'options': { outFormat: oracledb.OBJECT }
    }

    database.connect()
    .then(function(connection) {
        this.connection = connection;
        request.body.forEach(function(applicationDataCollection) {
            statement.binds = { 
                inApplicationId: applicationDataCollection.application_id,
                inDataCollectionId: applicationDataCollection.data_collection_id,
                inValue: applicationDataCollection.value,
                inProjectId: applicationDataCollection.project_id,
                outApplicationId: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT },
                outDataCollectionId: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT },
                outValue: { type: oracledb.STRING, dir: oracledb.BIND_OUT },
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
        var ids = [];
        results.forEach(function(result) {
            if (result.value().rowsAffected > 0) {
                ids.push({
                    'APPLICATIONID': result.value().outBinds.outApplicationId[0],
                    'DATACOLLECTIONID': result.value().outBinds.outDataCollectionId[0],
                    'VALUE': result.value().outBinds.outValue[0],
                    'PROJECTID': result.value().outBinds.outProjectId[0]
                });
            }
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

module.exports = router;