var express = require('express');
var oracledb = require('oracledb');
var promise = require('bluebird');

var authorization = require('../middleware/authorization');
var database = require('../middleware/database');
var errors = require('../middleware/errors');

var router = express.Router();

router.get('/api/v1/decision', authorization.authorize(), function(request, response, next) {
    var statement = {
        'sql': 'SELECT d.PUBLICSCORE, d.PRIVATESCORE, d.LASTCOMPUTEDAT, a.APPLICATIONID, a.NAME, a.DESCRIPTION ' +
               'FROM DECISION d JOIN APPLICATION a ON d.APPLICATIONID = a.APPLICATIONID ' +
               'WHERE d.APPLICATIONID = :inApplicationId AND d.PROJECTID = :inProjectId',
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

router.get('/api/v1/decision/batch', authorization.authorize(), function(request, response, next) {
    var statement = {
        'sql': 'SELECT d.PUBLICSCORE, d.PRIVATESCORE, d.LASTCOMPUTEDAT, a.APPLICATIONID, a.NAME, a.DESCRIPTION ' +
               'FROM DECISION d JOIN APPLICATION a ON d.APPLICATIONID = a.APPLICATIONID ' +
               'WHERE d.PROJECTID = :inProjectId',
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

router.put('/api/v1/decision', authorization.authorize(), function(request, response, next) {
    var connection;
    var result;
    var privateScore, publicScore;

    var statement = {
        'sql': 'BEGIN ' +
               'COMPUTE_DECISION_SCORE(:inApplicationId, :inProjectId, :outPublicScore, :outPrivateScore, ' +
               '                       :outApplicationId, :outProjectId); ' +
               'END;',
        'binds': { 
            inApplicationId: request.body.application_id,
            inProjectId: request.body.project_id,
            outPublicScore: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT },
            outPrivateScore: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT },
            outApplicationId: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT },
            outProjectId: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT }
        }
    }

    database.connect()
    .then(function(connection) {
        this.connection = connection;
        return database.executeStatement(connection, statement);
    })
    .then(function(result) {
        this.result = result;
        this.privateScore = result.outBinds.outPrivateScore == null ? 
                                result.outBinds.outPrivateScore : Number(result.outBinds.outPrivateScore.toFixed(2));
        this.publicScore = result.outBinds.outPublicScore == null ? 
                                result.outBinds.outPublicScore : Number(result.outBinds.outPublicScore.toFixed(2));

        statement.sql = 'UPDATE DECISION ' + 
                        'SET PUBLICSCORE = :inPublicScore, ' +
                        '    PRIVATESCORE = :inPrivateScore, ' +
                        '    LASTCOMPUTEDAT = SYSTIMESTAMP ' +
                        'WHERE APPLICATIONID = :inApplicationId AND PROJECTID = :inProjectId';
        statement.binds = { 
            inPublicScore: this.publicScore,
            inPrivateScore: this.privateScore,
            inApplicationId: request.body.application_id,
            inProjectId: request.body.project_id
        };
        return database.executeStatement(this.connection, statement);
    })
    .then(function(result) {
        return database.commit(this.connection);
    })
    .then(function() {
        database.closeConnection(this.connection);

        response.status(201).json({
            PUBLICSCORE: this.publicScore,
            PRIVATESCORE: this.privateScore
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

router.put('/api/v1/decision/batch', authorization.authorize(), function(request, response, next) {
    var connection;
    var executionPromises = [];
    var ids;
    var privateScore, publicScore;

    var statementStoredProcedure = {
        'sql': 'BEGIN ' +
               'COMPUTE_DECISION_SCORE(:inApplicationId, :inProjectId, :outPublicScore, :outPrivateScore, ' +
               '                       :outApplicationId, :outProjectId); ' +
               'END;',
        'options': { outFormat: oracledb.OBJECT }
    }
    var statementUpdate = {
        'sql': 'UPDATE DECISION ' + 
               'SET PUBLICSCORE = :inPublicScore, ' +
               '    PRIVATESCORE = :inPrivateScore, ' +
               '    LASTCOMPUTEDAT = SYSTIMESTAMP ' +
               'WHERE APPLICATIONID = :inApplicationId AND PROJECTID = :inProjectId ' +
               'RETURNING APPLICATIONID, PROJECTID, PUBLICSCORE, PRIVATESCORE ' +
               'INTO :outApplicationId, :outProjectId, :outPublicScore, :outPrivateScore',
        'options': { outFormat: oracledb.OBJECT }
    }

    database.connect()
    .then(function(connection) {
        this.connection = connection;
        request.body.forEach(function(decision) {
            statementStoredProcedure.binds = { 
                inApplicationId: decision.application_id,
                inProjectId: decision.project_id,
                outPublicScore: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT },
                outPrivateScore: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT },
                outApplicationId: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT },
                outProjectId: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT }
            }
            executionPromises.push(database.executeStatement(connection, statementStoredProcedure));
        });

        return promise.all(executionPromises.map(function(promise) {
            return promise.reflect();
        }))
    })
    .filter(function(promise) {
        return promise.isFulfilled();
    })
    .then(function(results) {
        this.executionPromises = [];

        results.forEach(function(result) {
            this.privateScore = result.value().outBinds.outPrivateScore == null ? 
                                result.value().outBinds.outPrivateScore : Number(result.value().outBinds.outPrivateScore.toFixed(2));
            this.publicScore = result.value().outBinds.outPublicScore == null ? 
                                result.value().outBinds.outPublicScore : Number(result.value().outBinds.outPublicScore.toFixed(2));

            statementUpdate.binds = { 
                inApplicationId: result.value().outBinds.outApplicationId,
                inProjectId: result.value().outBinds.outProjectId,
                inPublicScore: this.publicScore,
                inPrivateScore: this.privateScore,
                outApplicationId: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT },
                outProjectId: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT },
                outPublicScore: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT },
                outPrivateScore: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT }
            }
            executionPromises.push(database.executeStatement(this.connection, statementUpdate));
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
                this.privateScore = result.value().outBinds.outPrivateScore[0] == null ? 
                                result.value().outBinds.outPrivateScore[0] : Number(result.value().outBinds.outPrivateScore[0].toFixed(2));
                this.publicScore = result.value().outBinds.outPublicScore[0] == null ? 
                                result.value().outBinds.outPublicScore[0] : Number(result.value().outBinds.outPublicScore[0].toFixed(2));

                ids.push({
                    'APPLICATIONID': result.value().outBinds.outApplicationId[0],
                    'PROJECTID': result.value().outBinds.outProjectId[0],
                    'PUBLICSCORE': this.publicScore,
                    'PRIVATESCORE': this.privateScore
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