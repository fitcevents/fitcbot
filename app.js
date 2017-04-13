var restify = require('restify');
var builder = require('botbuilder');
var cognitiveservices = require('botbuilder-cognitiveservices');
var request = require('request');
var dotenv = require('dotenv');

// Load ENV variables
dotenv.load();

//=========================================================
// Bot Setup
//=========================================================

// Setup Restify Server
var server = restify.createServer();
server.listen(process.env.port || process.env.PORT || 3978, function () {
   console.log('%s listening to %s', server.name, server.url); 
});
  
// Create chat bot
var connector = new builder.ChatConnector({
    appId: process.env.MICROSOFT_APP_ID,
    appPassword: process.env.MICROSOFT_APP_PASSWORD
});
var bot = new builder.UniversalBot(connector);
server.post('/api/messages', connector.listen());


//var connector = new builder.ConsoleConnector().listen();
//var bot = new builder.UniversalBot(connector);


//=========================================================
// Bots Dialogs
//=========================================================

bot.dialog('/', [
    function (session) {
        var q = "Hello! I can answer questions about presentations, general questions about the event or show you a picture of a cute cat?";
        builder.Prompts.choice(session, q, "Presentations|FAQ|Cute Cats!");
    },
    function(session, results, next) {
        if (results.response) {
            if(results.response.index === 0){
                session.beginDialog('/presentations');
            }
            else if (results.response.index === 1){
                session.beginDialog('/faq');
            }
            else {
                next();
            }
        } else {
           next();
        }
    }, function(session, results, next){
        session.replaceDialog('/');
    }
]);

bot.dialog('/presentations', [
    function(session){
        var q = "What would you like to know? I can answer questions these questions:"
        builder.Prompts.choice(session, q, [
            "What are the next presentations?",
            "What are all the presentations happening right now?",
            "When is a speaker's talk?"
        ]);
    },
    function(session, results, next) {
        if (results.response) {
            if(results.response.index === 0){
                //TODO: fire off api request for nextPresentations
                next();
            }
            else if (results.response.index === 1){
                //TODO: fire off an api request for currentPresentations
                next();
            }
            else if (results.response.index === 2){
                session.beginDialog('/findSpeaker');
            } else {
                next();
            }
        } else {
            next();
        }
    }, 
    function(session, results) {
        session.endDialog();
    }
]);

bot.dialog('/findSpeaker', [
    function(session) {
        builder.Prompts.text(session, "What's the name of the speaker you are looking for?");
    },
    function(session, results, next) {
        session.send('Let me see what I can find about %s', results.response);
        session.sendTyping();
        
        request.post({
            url: "https://fitc.ca/wp/api/search/speaker",
            body: JSON.stringify({speaker: args.speaker})
        }, 
        function(error, response, body) {
            if(!error) {
                var answer = JSON.parse(body).response;
                // TODO turn this into a card
                session.send(response);
                next();
            } else {
                session.send("I couldn't find anything.");
                next();
            }
        }, 
        function(session){
            var q = "Do you want to lookup another speaker?";
            builder.Prompts.choice(session, q, "Yes|No");
        },
        function(session, results, next){
            if (results.response) {
                if(results.response.index === 0){
                    session.replaceDialog('/findSpeaker', {reprompt: true });
                } else if (results.response.index === 1){
                    session.endDialog();
                } else {
                    next();
                }
            } else {
                next();
            }
        });
    },
    function(session, results, next) {
        session.endDialog();
    }
]);


//=========================================================
// QnA Dialogs
//=========================================================

var recognizer = new congitiveservices.QnAMakerRecognizer({
    knowledgeBaseId: process.env.KB_ID,
    subscriptionKey: process.env.CS_SUBKEY
});

var basicQnAMakerDialog = new cognitiveservices.QnAMakerDialog({
    recognizers: [recognizer],
    defaultNoMatchMessage: 'You stumped me. Try again.',
    defaultMessage: 'What can I answer?',
    qnaThreshold: 0.3
});

bot.dialog('/faq', basicQnAMakerDialog);

/*
bot.dialog('/faq', [
    function(session){
        builder.Prompts.text(session, "What can I answer?");
    },
    function(session, results, next){
        session.sendTyping();

        var host = process.env.KB_HOST;
        var kbId = process.env.KB_ID;
        var csSubKey = process.env.CS_SUBKEY;
        request.post({
            url: host + "/knowledgebases/" + kbId + "/generateAnswer",
            headers: {
                "Ocp-Apim-Subscription-Key": csSubKey
            },
            body: JSON.stringify({question: results.response})
        }, function(error, response, body){
            var answer = JSON.parse(body).answer;
            session.send(answer);
            next();
        });
    }, 
    function(session){
        var q = "Would you like to ask another FAQ question or go back to the main menu?";
        builder.Prompts.choice(session, q, "Yes|Go Back");
    }, 
    function(session, results, next){
         if (results.response) {
            if(results.response.index === 0){
                session.replaceDialog('/faq', {reprompt: true });
            }
            else if (results.response.index === 1){
                session.endDialog();
            } else {
                next();
            }
         } else {
             next();
         }
    }
]);
*/