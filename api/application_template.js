var express = require('express');
var oracledb = require('oracledb');
var promise = require('bluebird');

var authorization = require('../middleware/authorization');
var database = require('../middleware/database');
var errors = require('../middleware/errors');

var router = express.Router();

router.get('/api/v1/application_template', authorization.authorize(), function(request, response, next) {
    var statement = {
        'sql': 'SELECT tc.CRITERIANAMEID, tc.CRITERIAVALUEID ' +
               'FROM APPLICATIONTEMPLATE at JOIN TEMPLATECRITERIA tc ON at.TEMPLATEID = tc.TEMPLATEID ' +
               'WHERE at.APPLICATIONID = :inApplicationId AND PROJECTID = :inProjectId ' +
               'AND at.ENABLED >= :inEnabled',
        'binds': { 
            inApplicationId: request.query.application_id,
            inProjectId: request.query.project_id,
            inEnabled: request.query.enabled
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

router.post('/api/v1/application_template', authorization.authorize(), function(request, response, next) {
    var statement = {
        'sql': 'INSERT INTO APPLICATIONTEMPLATE(APPLICATIONID, TEMPLATEID, PROJECTID) ' +
               'VALUES (:inApplicationId, :inTemplateId, :inProjectId)',
        'binds': { 
            inApplicationId: request.body.application_id,
            inTemplateId: request.body.template_id,
            inProjectId: request.body.project_id
        }
    }

    database.fullExecuteStatement(statement)
    .then(function(result) {
        response.status(201).send();
    })
    .catch(function(error) {
        next(error)
    })
});

router.post('/api/v1/application_template/batch', authorization.authorize(), function(request, response, next) {
    var connection;
    var ids;
    var executionPromises = [];
    var statement = {
        'sql': 'INSERT INTO APPLICATIONTEMPLATE(APPLICATIONID, TEMPLATEID, PROJECTID) ' +
               'VALUES (:inApplicationId, :inTemplateId, :inProjectId) ' + 
               'RETURNING APPLICATIONID, TEMPLATEID, PROJECTID ' +
               'INTO :outApplicationId, :outTemplateId, :outProjectId',
        'options': { outFormat: oracledb.OBJECT }
    }

    database.connect()
    .then(function(connection) {
        this.connection = connection;
        request.body.forEach(function(applicationTemplate) {
            statement.binds = { 
                inApplicationId: applicationTemplate.application_id,
                inTemplateId: applicationTemplate.template_id,
                inProjectId: applicationTemplate.project_id,
                outApplicationId: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT },
                outTemplateId: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT },
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
                'TEMPLATEID': result.value().outBinds.outTemplateId[0],
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

router.delete('/api/v1/application_template', authorization.authorize(), function(request, response, next) {
    var statement = {
        'sql': 'UPDATE APPLICATIONTEMPLATE ' +
               'SET ENABLED = 0 ' +
               'WHERE APPLICATIONID = :inApplicationId AND PROJECTID = :inProjectId',
        'binds': { 
            inApplicationId: request.body.application_id,
            inProjectId: request.body.project_id 
        },
        'options': { outFormat: oracledb.OBJECT }
    }

    database.fullExecuteStatement(statement)
    .then(function(result) {
        if (result.rowsAffected > 0)
            response.status(204).send();
        else {
            response.status(201).json({
                WARNING: 'Template not found for the given application id and project id'
            });
        }
    })
    .catch(function(error) {
        next(error)
    })
});

module.exports = router;