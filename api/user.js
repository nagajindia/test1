var express = require('express');
var oracledb = require('oracledb');
var bcrypt = require('bcrypt');
var jwt = require('jsonwebtoken');
var crypto = require('crypto');
var base64url = require('base64url');
var moment = require('moment');

var config = require('../config');

var database = require('../middleware/database');
var errors = require('../middleware/errors');
var mailer = require('../middleware/mailer');

var router = express.Router();

router.post('/api/v1/user/signup', function(request, response, next) {
    bcrypt.genSalt(10, function(error, salt) {
        if (error)
       		next(new errors.InternalServerError(error.message));
       	else {
       		bcrypt.hash(request.body.password, salt, function(error, hash) {
            	if (error)
       				next(new errors.InternalServerError(error.message));
       			else {
       				var connection;
       				var userId;
       				var name;
       				var email;
       				var token;
				    var statement = {
				        'options': { outFormat: oracledb.OBJECT }
				    }

				    database.connect()
    				.then(function(connection) {
        				this.connection = connection;
				      
        				statement.sql = 'INSERT INTO CCSTUSER (NAME, EMAIL, PASSWORD) ' +
						                'VALUES (:inName, :inEmail, :inPassword) ' +
						                'RETURNING USERID, NAME, EMAIL ' +
						                'INTO :outId, :outName, :outEmail';
						statement.binds = { 
				            inName: request.body.name,
				            inEmail: request.body.email == null ? null : request.body.email.toLowerCase(),
				            inPassword: hash,
				            outId: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT },
				            outName: { type: oracledb.STRING, dir: oracledb.BIND_OUT },
				            outEmail: { type: oracledb.STRING, dir: oracledb.BIND_OUT },
				        }

				        return database.executeStatement(connection, statement);
				    })
				    .then(function(result) {
				    	userId = result.outBinds.outId[0];
				    	name = result.outBinds.outName[0];
				    	email = result.outBinds.outEmail[0];
				    	token = base64url(crypto.randomBytes(128));
                        var expirationDate = moment().add(3, 'days').format('DD-MMM-YY H:mm:ss');

                        statement.sql = 'INSERT INTO TOKEN ' +
                                		'VALUES (:inUserId, :inValue, TO_TIMESTAMP(:inExpiresAt, \'dd-mon-yy hh24:mi:ss\'))';
                        statement.binds = { 
				            inUserId: userId,
				            inValue: token,
				            inExpiresAt: expirationDate
				        }  

				        return database.executeStatement(this.connection, statement);    		
				    })
            .then(function(result) {
              return database.commit(this.connection);
            })
				    .then(function(){
				      	database.closeConnection(this.connection);

				    	response.status(201).json({
				    		USERID: userId,
				    		NAME: name,
				    		EMAIL: email
				    	});

				    	var url = request.protocol + '://' + request.get('Host') +
		                          '/api/v1/user/verify/' + token;

						mailer.sendVerificationEmail(email, name, url);
				    })
				    .catch(errors.InternalServerError, function(error) {
				        next(error);
				    })
				    .catch(function(error) {
				        database.closeConnection(this.connection);
				        next(error);
				    })
       			}
        	});
       	}
    });
});

router.get('/api/v1/user/verify/:token', function(request, response, next) {
    var statement = {
        'sql': 'UPDATE ' +
               '(SELECT u.USERID, u.NAME, u.EMAIL, u.VERIFIED FROM ' +
               'CCSTUSER u JOIN TOKEN t ON u.USERID = t.USERID ' +
               'WHERE t.VALUE = :inToken AND CURRENT_TIMESTAMP <= t.EXPIRESAT) up ' +
               'SET up.VERIFIED = 1 ' +
               'RETURNING up.USERID, up.NAME, up.EMAIL, up.VERIFIED ' +
               'INTO :outId, :outName, :outEmail, :outVerified',
        'binds': { 
			inToken: request.params.token,
      outId: { type: oracledb.STRING, dir: oracledb.BIND_OUT },
			outName: { type: oracledb.STRING, dir: oracledb.BIND_OUT },
			outEmail: { type: oracledb.STRING, dir: oracledb.BIND_OUT },
			outVerified: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT }
		},
        'options': { outFormat: oracledb.OBJECT }
    }

    database.fullExecuteStatement(statement)
    .then(function(result) {
    	if (result.outBinds.outName.length == 0)
    		next(new errors.BadRequestError('User not found for the given token'));
    	else {
    		var payload = {
    			email: result.outBinds.outEmail[0]
    		};

    		response.status(200).json({
    			CCSTUSER: {
            USERID: result.outBinds.outId[0],
    				NAME: result.outBinds.outName[0],
	        		EMAIL: result.outBinds.outEmail[0],
	        		VERIFIED: result.outBinds.outVerified[0]
    			},
    			TOKEN: jwt.sign(payload, config.authorization.secretKey, { expiresIn: config.authorization.secretKeyExpiresIn })
        	});
    	}
    })
    .catch(function(error) {
        next(error)
    })
});

router.post('/api/v1/user/verify', function(request, response, next) {
	var token = base64url(crypto.randomBytes(128));
    var expirationDate = moment().add(3, 'days').format('DD-MMM-YY H:mm:ss');
    var statement = {
        'sql': 'MERGE INTO TOKEN t ' +
               'USING ( ' +
               'SELECT :inUserId USERID, :inToken VALUE, TO_TIMESTAMP(:inExpiresAt, \'dd-mon-yy hh24:mi:ss\') EXPIRESAT ' +
               'FROM DUAL) d ' +
               'ON (t.USERID = d.USERID) ' +
               'WHEN MATCHED THEN ' +
               'UPDATE SET t.VALUE = d.VALUE, t.EXPIRESAT = d.EXPIRESAT ' +
               'WHEN NOT MATCHED THEN ' +
               'INSERT (USERID, VALUE, EXPIRESAT) VALUES (d.USERID, d.VALUE, d.EXPIRESAT)',
        'binds': { 
            inUserId: request.body.user_id,
            inToken: token,
            inExpiresAt: expirationDate
        }
    }

    database.fullExecuteStatement(statement)
    .then(function(result) {
        response.status(201).send();

        var url = request.protocol + '://' + request.get('Host') +
		          '/api/v1/user/verify/' + token;

		mailer.sendVerificationEmail(request.body.email, request.body.name, url);
    })
    .catch(function(error) {
        next(error)
    })
});

router.post('/api/v1/user/login', function(request, response, next) {
    var statement = {
        'sql': 'SELECT * ' +
               'FROM CCSTUSER ' +
               'WHERE EMAIL = :inEmail',
        'binds': { 
            inEmail: request.body.email == null ? null : request.body.email.toLowerCase()
        },
        'options': { outFormat: oracledb.OBJECT }
    }

    database.fullExecuteStatement(statement)
    .then(function(result) {
    	if (result.rows.length == 0)
    		next(new errors.BadRequestError('User not found for the given email'));
    	else {
    		var user = result.rows[0];

            bcrypt.compare(request.body.password, user.PASSWORD, function(error, match) {
                if (error)
                	next(new errors.InternalServerError(error.message));
                else {
                    if (!match)
                        next(new errors.BadRequestError('Invalid password'));
                    else {
                        if (user.VERIFIED == 1) {
                            var payload = {
                            	email: user.EMAIL
                            };

                            response.status(200).json({
                							CCSTUSER: {
                                USERID: user.USERID,
                								NAME: user.NAME,
            					        		EMAIL: user.EMAIL,
            					        		VERIFIED: user.VERIFIED
            				    			},
            				    			TOKEN: jwt.sign(payload, config.authorization.secretKey, { expiresIn: config.authorization.secretKeyExpiresIn })
        					          });
                        } else {
                        	response.status(200).json({
              							CCSTUSER: {
                              USERID: user.USERID,
              								NAME: user.NAME,
          					        		EMAIL: user.EMAIL,
          					        		VERIFIED: user.VERIFIED
          				    			}
        					        });
                        }
                    }
                }
            });
    	}
    })
    .catch(function(error) {
        next(error)
    })
});

module.exports = router;