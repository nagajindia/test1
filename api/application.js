var express = require('express');
var oracledb = require('oracledb');
var promise = require('bluebird');

var authorization = require('../middleware/authorization');
var database = require('../middleware/database');
var errors = require('../middleware/errors');

var router = express.Router();

router.get('/api/v1/application', authorization.authorize(), function(request, response, next) {
    var statement = {
        'sql': 'SELECT a.*, ' +
        '(SELECT COUNT(*) FROM APPLICATIONTEMPLATE ' +
        ' WHERE APPLICATIONID = a.APPLICATIONID AND ENABLED = 1 ' +
        ' AND PROJECTID = :inProjectId) AS HASTEMPLATE, ' +
        '(SELECT CASE WHEN ' +
        '    (SELECT COUNT(*) FROM APPLICATIONCRITERIA ' +
        '     WHERE APPLICATIONID = a.APPLICATIONID AND PROJECTID = :inProjectId) = ' +
        '    (SELECT COUNT(*) FROM CRITERIANAME) ' +
        'THEN 1 ELSE 0 END FROM DUAL) AS HASALLCRITERIA, ' +
        '(SELECT MAX(CREATEDAT) FROM APPLICATIONCRITERIA ' +
        ' WHERE APPLICATIONID = a.APPLICATIONID ' +
        ' AND PROJECTID = :inProjectId) AS LASTCRITERIACREATEDAT, ' +
        '(SELECT LASTCOMPUTEDAT FROM DECISION ' +
        ' WHERE APPLICATIONID = a.APPLICATIONID ' +
        ' AND PROJECTID = :inProjectId) AS LASTDECISIONCOMPUTEDAT ' +
        'FROM APPLICATION a JOIN PROJECTAPPLICATION pa ON a.APPLICATIONID = pa.APPLICATIONID ' +
        'WHERE pa.PROJECTID = :inProjectId',
        'binds': {
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

router.post('/api/v1/application', authorization.authorize(), function(request, response, next) {
    var connection;
    var result;
    var statement = {
        'sql': 'BEGIN ' +
        'INSERT_APPLICATION(:inName, :inDescription, :inOwner, :inCountry, ' +
        '                   :inBusinessArea, :inSaasName, :outId, ' +
        '                   :outName, :outDescription, :outOwner, :outCountry, ' +
        '                   :outBusinessArea, :outSaasName);' +
        'END;',
        'binds': {
            inName: request.body.name,
            inDescription: request.body.description,
            inOwner: request.body.owner,
            inCountry: request.body.country,
            inBusinessArea: request.body.business_area,
            inSaasName: request.body.saas_name,
            outId: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT },
            outName: { type: oracledb.STRING, dir: oracledb.BIND_OUT },
            outDescription: { type: oracledb.STRING, dir: oracledb.BIND_OUT },
            outOwner: { type: oracledb.STRING, dir: oracledb.BIND_OUT },
            outCountry: { type: oracledb.STRING, dir: oracledb.BIND_OUT },
            outBusinessArea: { type: oracledb.STRING, dir: oracledb.BIND_OUT },
            outSaasName: { type: oracledb.STRING, dir: oracledb.BIND_OUT }
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

            statement.sql = 'INSERT INTO VERTEX(APPLICATIONID) ' +
                'VALUES (:inApplicationId)';
            statement.binds = {
                inApplicationId: this.result.outBinds.outId
            };

            return database.executeStatement(this.connection, statement);
        })
        .then(function(result) {
            if (result.rowsAffected > 0)
                return database.commit(this.connection);
            else
                next(new errors.BadRequestError("There was an error while creating the corresponding vertex"));
        })
        .then(function() {
            database.closeConnection(this.connection);

            response.status(201).json({
                APPLICATIONID: this.result.outBinds.outId,
                NAME: this.result.outBinds.outName,
                DESCRIPTION: this.result.outBinds.outDescription,
                OWNER: this.result.outBinds.outOwner,
                COUNTRY: this.result.outBinds.outCountry,
                BUSINESSAREA: this.result.outBinds.outBusinessArea
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

router.post('/api/v1/application/batch', authorization.authorize(), function(request, response, next) {
    var connection;
    var ids;
    var executionPromises = [];
    var statement = {
        'sql': 'BEGIN ' +
        'INSERT_APPLICATION(:inName, :inDescription, :inOwner, :inCountry, ' +
        '                   :inBusinessArea, :inSaasName, :outId, ' +
        '                   :outName, :outDescription, :outOwner, :outCountry, ' +
        '                   :outBusinessArea, :outSaasName);' +
        'END;',
        'options': { outFormat: oracledb.OBJECT }
    }

    database.connect()
        .then(function(connection) {
            this.connection = connection;
            request.body.forEach(function(application) {
                statement.binds = {
                    inName: application.name,
                    inDescription: application.description,
                    inOwner: application.owner,
                    inCountry: application.country,
                    inBusinessArea: application.business_area,
                    inSaasName: application.saas_name,
                    outId: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT },
                    outName: { type: oracledb.STRING, dir: oracledb.BIND_OUT },
                    outDescription: { type: oracledb.STRING, dir: oracledb.BIND_OUT },
                    outOwner: { type: oracledb.STRING, dir: oracledb.BIND_OUT },
                    outCountry: { type: oracledb.STRING, dir: oracledb.BIND_OUT },
                    outBusinessArea: { type: oracledb.STRING, dir: oracledb.BIND_OUT },
                    outSaasName: { type: oracledb.STRING, dir: oracledb.BIND_OUT },
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
                statement.sql = 'INSERT INTO VERTEX(APPLICATIONID) ' +
                    'VALUES (:inApplicationId) ' +
                    'RETURNING APPLICATIONID INTO :outApplicationId';
                statement.binds = {
                    inApplicationId: result.value().outBinds.outId,
                    outApplicationId: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT }
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
            var ids = [];
            results.forEach(function(result) {
                ids.push({
                    'APPLICATIONID': result.value().outBinds.outApplicationId[0]
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

router.delete('/api/v1/application/:application_id', authorization.authorize(), function(request, response, next) {
    var statement = {
        'sql': 'DELETE ' +
        'FROM APPLICATION ' +
        'WHERE APPLICATIONID = :inApplicationId',
        'binds': {
            inApplicationId: request.params.application_id
        },
        'options': { outFormat: oracledb.OBJECT }
    }

    database.fullExecuteStatement(statement)
        .then(function(result) {
            if (result.rowsAffected > 0)
                response.status(204).send();
            else {
                response.status(201).json({
                    WARNING: 'Application not found for the given application id'
                });
            }
        })
        .catch(function(error) {
            next(error)
        })
});

module.exports = router;