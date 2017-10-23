var express = require('express');
var oracledb = require('oracledb');
var promise = require('bluebird');

var authorization = require('../middleware/authorization');
var database = require('../middleware/database');
var errors = require('../middleware/errors');

var router = express.Router();

router.get('/api/v1/graph_vertex', authorization.authorize(), function(request, response, next) {
    var statement = {
        'sql': 'SELECT v.VERTEXID, a.APPLICATIONID, a.NAME ' +
               'FROM GRAPH g JOIN GRAPHVERTEX gv ON g.GRAPHID = gv.GRAPHID ' +
               'JOIN VERTEX v ON v.VERTEXID = gv.VERTEXID ' +
               'JOIN APPLICATION a ON a.APPLICATIONID = v.APPLICATIONID ' +
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