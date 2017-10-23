function BadRequestError(detailedMessage) {
	this.message = 'Error understanding the request';
	this.detailedMessage = detailedMessage || '';
	this.statusCode = 400;

	Error.captureStackTrace(this, BadRequestError);
}

BadRequestError.prototype = Object.create(Error.prototype);
BadRequestError.prototype.constructor = BadRequestError;

function UnauthorizedError(detailedMessage) {
	this.message = 'Error authenticating user';
	this.detailedMessage = detailedMessage || '';
	this.statusCode = 401;

	Error.captureStackTrace(this, UnauthorizedError);
}

UnauthorizedError.prototype = Object.create(Error.prototype);
UnauthorizedError.prototype.constructor = UnauthorizedError;

function NotFoundError(detailedMessage) {
	this.message = 'Error finding resources';
	this.detailedMessage = detailedMessage || '';
	this.statusCode = 404;

	Error.captureStackTrace(this, NotFoundError);
}

NotFoundError.prototype = Object.create(Error.prototype);
NotFoundError.prototype.constructor = NotFoundError;

function InternalServerError(detailedMessage) {
	this.message = 'Error fulfilling the request';
	this.detailedMessage = detailedMessage || '';
	this.statusCode = 500;

	Error.captureStackTrace(this, InternalServerError);
}

InternalServerError.prototype = Object.create(Error.prototype);
InternalServerError.prototype.constructor = InternalServerError;

module.exports = {BadRequestError, UnauthorizedError, NotFoundError, InternalServerError};