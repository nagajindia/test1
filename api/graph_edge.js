var express = require('express');
var oracledb = require('oracledb');
var promise = require('bluebird');

var authorization = require('../middleware/authorization');
var database = require('../middleware/database');
var errors = require('../middleware/errors');

var router = express.Router();

router.get('/api/v1/graph_edge', authorization.authorize(), function(request, response, next) {
    var statement = {
        'sql': 'SELECT ge.VERTEXFROMID, ge.VERTEXTOID ' +
               'FROM GRAPH g JOIN GRAPHEDGE ge ON g.GRAPHID = ge.GRAPHID ' +
               'WHERE g.PROJECTID = :inProjectId',
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

module.exports = router;