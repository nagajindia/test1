var express = require('express');
var oracledb = require('oracledb');
var promise = require('bluebird');

var authorization = require('../middleware/authorization');
var database = require('../middleware/database');
var errors = require('../middleware/errors');

var router = express.Router();

router.get('/api/v1/application_criteria', authorization.authorize(), function(request, response, next) {
    var statement = {
        'sql': 'SELECT CRITERIANAMEID, CRITERIAVALUEID ' +
               'FROM APPLICATIONCRITERIA ' +
               'WHERE APPLICATIONID = :inApplicationId AND PROJECTID = :inProjectId ' +
               'ORDER BY CRITERIANAMEID ASC',
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

router.post('/api/v1/application_criteria/batch', authorization.authorize(), function(request, response, next) {
    var connection;
    var ids;
    var executionPromises = [];
    var statement = {
        'sql': 'INSERT INTO APPLICATIONCRITERIA(APPLICATIONID, CRITERIANAMEID, CRITERIAVALUEID, PROJECTID) ' +
               'VALUES (:inApplicationId, :inCriteriaNameId, :inCriteriaValueId, :inProjectId) ' + 
               'RETURNING APPLICATIONID, CRITERIANAMEID, CRITERIAVALUEID, PROJECTID ' +
               'INTO :outApplicationId, :outCriteriaNameId, :outCriteriaValueId, :outProjectId',
        'options': { outFormat: oracledb.OBJECT }
    }

    database.connect()
    .then(function(connection) {
        this.connection = connection;
        request.body.forEach(function(applicationCriteria) {
            statement.binds = { 
                inApplicationId: applicationCriteria.application_id,
                inCriteriaNameId: applicationCriteria.criteria_name_id,
                inCriteriaValueId: applicationCriteria.criteria_value_id,
                inProjectId: applicationCriteria.project_id,
                outApplicationId: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT },
                outCriteriaNameId: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT },
                outCriteriaValueId: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT },
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
                'CRITERIANAMEID': result.value().outBinds.outCriteriaNameId[0],
                'CRITERIAVALUEID': result.value().outBinds.outCriteriaValueId[0],
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

router.put('/api/v1/application_criteria/batch', authorization.authorize(), function(request, response, next) {
    var connection;
    var ids;
    var executionPromises = [];
    var statement = {
        'sql': 'UPDATE APPLICATIONCRITERIA ' +
               'SET CRITERIAVALUEID = :inCriteriaValueId, ' +
               'CREATEDAT = SYSTIMESTAMP ' + 
               'WHERE APPLICATIONID = :inApplicationId AND PROJECTID = :inProjectId ' +
               'AND CRITERIANAMEID = :inCriteriaNameId ' +
               'RETURNING APPLICATIONID, CRITERIANAMEID, CRITERIAVALUEID, PROJECTID ' + 
               'INTO :outApplicationId, :outCriteriaNameId, :outCriteriaValueId, :outProjectId',
        'options': { outFormat: oracledb.OBJECT }
    }

    database.connect()
    .then(function(connection) {
        this.connection = connection;
        request.body.forEach(function(applicationCriteria) {
            statement.binds = { 
                inApplicationId: applicationCriteria.application_id,
                inCriteriaNameId: applicationCriteria.criteria_name_id,
                inCriteriaValueId: applicationCriteria.criteria_value_id,
                inProjectId: applicationCriteria.project_id,
                outApplicationId: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT },
                outCriteriaNameId: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT },
                outCriteriaValueId: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT },
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
                    'CRITERIANAMEID': result.value().outBinds.outCriteriaNameId[0],
                    'CRITERIAVALUEID': result.value().outBinds.outCriteriaValueId[0],
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