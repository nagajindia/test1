var express = require('express');
var oracledb = require('oracledb');

var authorization = require('../middleware/authorization');
var database = require('../middleware/database');
var errors = require('../middleware/errors');

var router = express.Router();

router.get('/api/v1/template', authorization.authorize(), function(request, response, next) {
    var statement = {
        'sql': 'SELECT * FROM TEMPLATE ' +
               'WHERE TEMPLATEID NOT IN ' +
               '    (SELECT TEMPLATEID FROM USERTEMPLATE ' +
               '     WHERE USERID <> :inUserId)',
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

router.post('/api/v1/template', authorization.authorize(), function(request, response, next) {
    var statement = {
        'sql': 'INSERT INTO TEMPLATE(NAME, DESCRIPTION) ' +
               'VALUES (:inName, :inDescription) ' +
               'RETURNING TEMPLATEID, NAME, DESCRIPTION ' +
               'INTO :outId, :outName, :outDescription',
        'binds': { 
            inName: request.body.name,
            inDescription: request.body.description,
            outId: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT },
            outName: { type: oracledb.STRING, dir: oracledb.BIND_OUT },
            outDescription: { type: oracledb.STRING, dir: oracledb.BIND_OUT }  
        },
        'options': { outFormat: oracledb.OBJECT }
    }

    database.fullExecuteStatement(statement)
    .then(function(result) {
        response.status(201).json({
            TEMPLATEID: result.outBinds.outId[0],
            NAME: result.outBinds.outName[0],
            DESCRIPTION: result.outBinds.outDescription[0],
        })
    })
    .catch(function(error) {
        next(error)
    })
});

router.delete('/api/v1/template', authorization.authorize(), function(request, response, next) {
    var statement = {
        'sql': 'DELETE ' +
               'FROM TEMPLATE ' +
               'WHERE TEMPLATEID IN ' +
               '    (SELECT t.TEMPLATEID ' +
               '     FROM TEMPLATE t JOIN USERTEMPLATE ut ON t.TEMPLATEID = ut.TEMPLATEID ' +
               '     WHERE t.TEMPLATEID = :inTemplateId AND ut.USERID = :inUserId)',
        'binds': { 
            inTemplateId: request.body.template_id,
            inUserId: request.body.user_id 
        },
        'options': { outFormat: oracledb.OBJECT }
    }

    database.fullExecuteStatement(statement)
    .then(function(result) {
        if (result.rowsAffected > 0)
            response.status(204).send();
        else {
            response.status(201).json({
                WARNING: 'Template not found for the given template id and user id'
            });
        }
    })
    .catch(function(error) {
        next(error)
    })
});

module.exports = router;