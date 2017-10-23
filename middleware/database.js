var oracledb = require('oracledb');
var promise = require('bluebird');

var config = require('../config');
var errors = require('./errors');

function connect() {
    return new promise(function(resolve, reject) {
        oracledb.getConnection(config.database.connection)
            .then(function(connection) {
                console.log('Connection open');
                resolve(connection);
            })
            .catch(function(error) {
                console.log('Error connecting to database: ' + error.message);
                reject(new errors.InternalServerError(error.message));
            })
    });
}

function executeStatement(connection, statement) {
    return new promise(function(resolve, reject) {
        connection.execute(statement.sql, statement.binds || {}, statement.options || {})
            .then(function(result) {
                console.log('Statement executed');
                resolve(result);
            })
            .catch(function(error) {
                console.log('Error executing statement: ' + error.message);
                reject(new errors.BadRequestError(error.message));
            })
    });
}

function commit(connection) {
    return new promise(function(resolve, reject) {
        connection.commit()
            .then(function() {
                console.log('Connection committed');
                resolve();
            })
            .catch(function(error) {
                console.log('Error committing connection: ' + error.message);
                reject(new errors.InternalServerError(error.message))
            })
    })
}

function closeConnection(connection) {
    connection.close();
    console.log('Connection closed');
}

function fullExecuteStatement(statement) {
    var connection;
    var result;

    return new promise(function(resolve, reject) {
        connect()
            .then(function(connection) {
                this.connection = connection;
                return executeStatement(connection, statement);
            })
            .then(function(result) {
                this.result = result;
                return commit(this.connection);
            })
            .then(function() {
                closeConnection(this.connection);
                resolve(this.result);
            })
            .catch(errors.InternalServerError, function(error) {
                reject(error);
            })
            .catch(function(error) {
                closeConnection(this.connection);
                reject(error);
            })
    });
}

module.exports = {connect, executeStatement, commit, closeConnection, fullExecuteStatement};