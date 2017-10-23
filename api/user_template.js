var express = require('express');
var oracledb = require('oracledb');

var authorization = require('../middleware/authorization');
var database = require('../middleware/database');

var router = express.Router();

router.get('/api/v1/user_template', authorization.authorize(), function(request, response, next) {
    var statement = {
        'sql': 'SELECT t.TEMPLATEID, t.NAME, t.DESCRIPTION ' +
               'FROM TEMPLATE t JOIN USERTEMPLATE ut ON t.TEMPLATEID = ut.TEMPLATEID ' +
               'WHERE ut.USERID = :inUserId',
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

router.post('/api/v1/user_template', authorization.authorize(), function(request, response, next) {
    var statement = {
        'sql': 'INSERT INTO USERTEMPLATE ' +
               'VALUES (:inUserId, :inTemplateId)',
        'binds': { 
            inUserId: request.body.user_id,
            inTemplateId: request.body.template_id  
        },
        'options': { outFormat: oracledb.OBJECT }
    }

    database.fullExecuteStatement(statement)
    .then(function(result) {
        response.status(201).send();
    })
    .catch(function(error) {
        next(error)
    })
});

module.exports = router;