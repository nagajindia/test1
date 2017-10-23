var express = require('express');
var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');

var errors = require('./middleware/errors');

var user = require('./api/user');
var application = require('./api/application');
var template = require('./api/template');
var applicationTemplate = require('./api/application_template');
var project = require('./api/project');
var projectApplication = require('./api/project_application');
var criteriaNameValue = require('./api/criteria_name_value');
var applicationCriteria = require('./api/application_criteria');
var decision = require('./api/decision');
var userTemplate = require('./api/user_template');
var templateCriteria = require('./api/template_criteria');
var dataCollection = require('./api/data_collection');
var applicationDataCollection = require('./api/application_data_collection');
var applicationRelated = require('./api/application_related');
var graphVertex = require('./api/graph_vertex');
var graphEdge = require('./api/graph_edge');
var graph = require('./api/graph');
var saas_product =require('./api/saas_product');

var app = express();

app.disable('etag');
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', user);
app.use('/', application);
app.use('/', template);
app.use('/', applicationTemplate);
app.use('/', project);
app.use('/', projectApplication);
app.use('/', criteriaNameValue);
app.use('/', applicationCriteria);
app.use('/', decision);
app.use('/', userTemplate);
app.use('/', templateCriteria);
app.use('/', dataCollection);
app.use('/', applicationDataCollection);
app.use('/', applicationRelated);
app.use('/', graphVertex);
app.use('/', graphEdge);
app.use('/', graph);
app.use('/', saas_product);


app.use(function(request, response, next) {
    next(new errors.NotFoundError());
});

app.use(function(error, request, response, next) {
    response.locals.message = error.message;
    response.locals.error = request.app.get('env') === 'development' ? error : {};
    response.status(error.statusCode).json(error);
});

module.exports = app;