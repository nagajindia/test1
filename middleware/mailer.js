var nodemailer = require('nodemailer');
var handlebars = require('handlebars');
var fs = require('fs');

var config = require('../config');

function prepare() {
    return nodemailer.createTransport("SMTP", {
        service: config.mailer.service,
        auth: {
            XOAuth2: {
                user: config.mailer.user,
                clientId: config.mailer.clientId,
                clientSecret: config.mailer.clientSecret,
                refreshToken: config.mailer.refreshToken
            }
        }
    });
}

function sendVerificationEmail(to, name, url) {
    var transporter = prepare();

    console.log("sto per leggere");

    fs.readFile('../views/email.hbs', { encoding: 'utf-8' }, function(error, hbs) {
        console.log("sto per leggere2");
        console.log("error: " + error );
        if (!error) {
            var template = handlebars.compile(hbs);
            var parameters = {
                name: name,
                url: url
            };
            var html = template(parameters);

            transporter.sendMail({
                from: config.mailer.user,
                to: to,
                subject: 'Verify your account',
                html: html,
                attachments: [{
                    filename: 'oracle.png',
                    path: 'public/images/oracle.png',
                    cid: 'img@oracle'
                }]
            }, function(error, response) {
                transporter.close();
            })
        }
    });
}

module.exports = {sendVerificationEmail};