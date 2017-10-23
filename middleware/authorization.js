var jwt = require('jsonwebtoken');

var config = require('../config');

var errors = require('./errors');

function authorize() {
	return function(request, response, next) {
		 /* var token;
        var payload;

        if (!request.headers.authorization)
            next(new errors.UnauthorizedError('Missing authorization headers'));
        else {
        	try {
        		token = request.headers.authorization.split(' ')[1];
            	payload = jwt.verify(token, config.authorization.secretKey);
                next();
        	} catch (error) {
            	if (error.name === 'TokenExpiredError')
                	next(new errors.UnauthorizedError('Token expired'));
	            else
                	next(new errors.UnauthorizedError('Authorization failed'));
        	}
        }*/

        next();
    }
}

module.exports = {authorize};