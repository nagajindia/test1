var express = require('express');
var oracledb = require('oracledb');
var promise = require('bluebird');

var authorization = require('../middleware/authorization');
var database = require('../middleware/database');
var errors = require('../middleware/errors');
var graph = require('../middleware/graph');

var router = express.Router();

router.get('/api/v1/graph', authorization.authorize(), function(request, response, next) {
    var statement = {
        'sql': 'SELECT * ' +
               'FROM GRAPH ' +
               'WHERE PROJECTID = :inProjectId',
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

router.get('/api/v1/graph_scc', authorization.authorize(), function(request, response, next) {
    var connection;
    var executionPromises = [];

    var vertexRows;
    var edgeRows;
    var vertices = [];
    var edges= {};
    var scc;
    var communities = [];

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

    database.connect()
    .then(function(connection) {
        this.connection = connection;
        return database.executeStatement(connection, statement);
    })
    .then(function(result) {
        vertexRows = result.rows;
        statement.sql = 'SELECT v.VERTEXID AS VERTEXFROMID, ge.VERTEXTOID ' +
                        'FROM VERTEX v ' +
                        'JOIN GRAPHVERTEX gv ON v.VERTEXID = gv.VERTEXID ' +
                        'JOIN GRAPH g ON g.GRAPHID = gv.GRAPHID ' +
                        'FULL OUTER JOIN GRAPHEDGE ge ON gv.VERTEXID = ge.VERTEXFROMID ' +
                        'WHERE g.PROJECTID = :inProjectId ' +
                        'ORDER BY v.VERTEXID';

        return database.executeStatement(this.connection, statement);
    })
    .then(function(result) {
        edgeRows = result.rows;
        
        vertexRows.forEach(function(v) {
            vertices.push(v['VERTEXID']);
        });

        var tmp = {};
        edgeRows.forEach(function(e) {
            if (!tmp[e['VERTEXFROMID']])
                tmp[e['VERTEXFROMID']] = [];
            if (e['VERTEXTOID'] != null)
                tmp[e['VERTEXFROMID']].push(e['VERTEXTOID']);
        });

        edges = Object.keys(tmp).map(function(k){
            return tmp[k];
        });

        scc = graph.getSCC(vertices, edges);

        scc.forEach(function(ids) {
            statement.sql = 'SELECT PUBLICSCORE, PRIVATESCORE ' +
                            'FROM VERTEX v JOIN DECISION d ON v.APPLICATIONID = d.APPLICATIONID ' +
                            'WHERE d.PROJECTID = :inProjectId AND v.VERTEXID IN (' + ids.join(',') + ')';

            statement.binds = {
                inProjectId: request.query.project_id
            }
            executionPromises.push(database.executeStatement(this.connection, statement));
        });

        return promise.all(executionPromises.map(function(promise) {
            return promise.reflect();
        }))
    })
    .filter(function(promise) {
        return promise.isFulfilled();
    })
    .then(function(results){
        scoresSCC = [];

        results.forEach(function(result) {
            var scores = result.value().rows;
            
            var publicScore = 0;
            var privateScore = 0;

            scores.forEach(function(row) {
                if (row['PUBLICSCORE'] == null || publicScore == null)
                    publicScore = null;
                else
                    publicScore += row['PUBLICSCORE'];

                if (row['PRIVATESCORE'] == null || privateScore == null)
                    privateScore = null;
                else
                    privateScore += row['PRIVATESCORE'];
            });

            if (publicScore != null)
                publicScore /= scores.length;
            if (privateScore != null)
                privateScore /= scores.length;

            scoresSCC.push({
                'PUBLICSCORE': publicScore,
                'PRIVATESCORE': privateScore
            });
        });

        for (var i = 0; i < scc.length; i++) {
            communities.push({
                'VERTICES': scc[i],
                'PUBLICSCORE': scoresSCC[i]['PUBLICSCORE'],
                'PRIVATESCORE': scoresSCC[i]['PRIVATESCORE']
            });
        }
        
        statement.sql = 'UPDATE GRAPH ' +
                        'SET LASTCOMPUTEDAT = SYSTIMESTAMP ' +
                        'WHERE PROJECTID = :inProjectId';
        statement.binds = {
            inProjectId: request.query.project_id
        }

        return database.executeStatement(this.connection, statement);
    })
    .then(function(result) {
        database.closeConnection(this.connection);

        response.status(200).json({
            'VERTICES': vertexRows,
            'EDGES': edgeRows,
            'SCC': communities
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

module.exports = router;