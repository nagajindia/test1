var express = require('express');
var oracledb = require('oracledb');
var promise = require('bluebird');

var authorization = require('../middleware/authorization');
var database = require('../middleware/database');
var errors = require('../middleware/errors');

var router = express.Router();

router.get('/api/v1/template_criteria', authorization.authorize(), function(request, response, next) {
    var statement = {
        'sql': 'SELECT CRITERIANAMEID, CRITERIAVALUEID ' +
               'FROM TEMPLATECRITERIA ' +
               'WHERE TEMPLATEID = :inTemplateId',
        'binds': { 
            inTemplateId: request.query.template_id
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

router.post('/api/v1/template_criteria/batch', authorization.authorize(), function(request, response, next) {
    var connection;
    var ids;
    var executionPromises = [];
    var statement = {
        'sql': 'INSERT INTO TEMPLATECRITERIA ' +
               'VALUES (:inTemplateId, :inCriteriaNameId, :inCriteriaValueId) ' + 
               'RETURNING TEMPLATEID, CRITERIANAMEID, CRITERIAVALUEID ' +
               'INTO :outTemplateId, :outCriteriaNameId, :outCriteriaValueId',
        'options': { outFormat: oracledb.OBJECT }
    }

    database.connect()
    .then(function(connection) {
        this.connection = connection;
        request.body.forEach(function(templateCriteria) {
            statement.binds = { 
                inTemplateId: templateCriteria.template_id,
                inCriteriaNameId: templateCriteria.criteria_name_id,
                inCriteriaValueId: templateCriteria.criteria_value_id,
                outTemplateId: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT },
                outCriteriaNameId: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT },
                outCriteriaValueId: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT }
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
                'TEMPLATEID': result.value().outBinds.outTemplateId[0],
                'CRITERIANAMEID': result.value().outBinds.outCriteriaNameId[0],
                'CRITERIAVALUEID': result.value().outBinds.outCriteriaValueId[0]
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

router.put('/api/v1/template_criteria/batch', authorization.authorize(), function(request, response, next) {
    var connection;
    var ids;
    var executionPromises = [];
    var statement = {
        'sql': 'UPDATE TEMPLATECRITERIA ' +
               'SET CRITERIAVALUEID = :inCriteriaValueId ' + 
               'WHERE TEMPLATEID = :inTemplateId AND CRITERIANAMEID = :inCriteriaNameId ' +
               'RETURNING TEMPLATEID, CRITERIANAMEID, CRITERIAVALUEID ' + 
               'INTO :outTemplateId, :outCriteriaNameId, :outCriteriaValueId',
        'options': { outFormat: oracledb.OBJECT }
    }

    database.connect()
    .then(function(connection) {
        this.connection = connection;
        request.body.forEach(function(templateCriteria) {
            statement.binds = { 
                inTemplateId: templateCriteria.template_id,
                inCriteriaNameId: templateCriteria.criteria_name_id,
                inCriteriaValueId: templateCriteria.criteria_value_id,
                outTemplateId: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT },
                outCriteriaNameId: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT },
                outCriteriaValueId: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT }
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
                    'TEMPLATEID': result.value().outBinds.outTemplateId[0],
                    'CRITERIANAMEID': result.value().outBinds.outCriteriaNameId[0],
                    'CRITERIAVALUEID': result.value().outBinds.outCriteriaValueId[0]
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