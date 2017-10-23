var express = require('express');
var oracledb = require('oracledb');
var promise = require('bluebird');

var authorization = require('../middleware/authorization');
var database = require('../middleware/database');
var errors = require('../middleware/errors');

var router = express.Router();

router.get('/api/v1/saas_product', authorization.authorize(), function(request, response, next) {
    var statement = {
        'sql': 'SELECT * ' +
        'FROM SAASPRODUCT',
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

module.exports = router;