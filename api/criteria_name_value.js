var express = require('express');
var oracledb = require('oracledb');

var authorization = require('../middleware/authorization');
var database = require('../middleware/database');

var router = express.Router();

router.get('/api/v1/criteria_name_value', authorization.authorize(), function(request, response, next) {
    var statement = {
        'sql': 'SELECT cn.*, cv.*, cnv.OPTIONDESCRIPTION, cnv.PUBLICCLOUD, cnv.PRIVATECLOUD ' +
               'FROM CRITERIANAME cn JOIN CRITERIANAMEVALUE cnv ON cn.CRITERIANAMEID = cnv.CRITERIANAMEID ' +
               'JOIN CRITERIAVALUE cv ON cv.CRITERIAVALUEID = cnv.CRITERIAVALUEID',
        'options': { outFormat: oracledb.OBJECT }
    }

    database.fullExecuteStatement(statement)
    .then(function(result) {
        var criteriaNameValues = {};
        result.rows.forEach(function(row) {
            var criteriaNameId = row.CRITERIANAMEID;
            var criteriaNameObj = criteriaNameValues[criteriaNameId];

            if (criteriaNameObj == null) {
                criteriaNameObj = {
                    'CRITERIANAME': {
                        'CRITERIANAMEID': row.CRITERIANAMEID,
                        'NAME': row.NAME,
                        'DESCRIPTION': row.DESCRIPTION,
                        'CATEGORY': row.CATEGORY
                    },
                    'CRITERIANAMEVALUES': [] 
                };
            }

            criteriaNameObj.CRITERIANAMEVALUES.push({
                'CRITERIAVALUE': {
                    'CRITERIAVALUEID': row.CRITERIAVALUEID,
                    'VALUE': row.VALUE
                },
                'CRITERIANAMEVALUE': {
                    'OPTIONDESCRIPTION': row.OPTIONDESCRIPTION,
                    'PUBLICCLOUD': row.PUBLICCLOUD,
                    'PRIVATECLOUD': row.PRIVATECLOUD
                }
            });

            criteriaNameValues[criteriaNameId] = criteriaNameObj;
        });

        var values = Object.keys(criteriaNameValues).map(function(key) {
            return criteriaNameValues[key];
        });

        response.status(200).json(values);
    })
    .catch(function(error) {
        next(error)
    })
});

module.exports = router;