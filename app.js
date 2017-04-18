var restify = require('restify');
var builder = require('botbuilder');
var cognitiveServices = require('botbuilder-cognitiveservices');
var request = require('request');
var rp = require('request-promise');
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
    function(session, next) {
        builder.Prompts.text(session, "What's the name of the speaker you are looking for?");
    },
    function(session, results, next) {
        session.send('Let me see what I can find about "%s"', results.response);
        session.sendTyping();

        var rp_options = {
            uri: 'http://fitc.local/fitc/wp/api/services/search/speaker/' + encodeURIComponent(results.response),
            headers: {
                'User-Agent': 'Request-Promise',
                'Content-Type': 'application/json'
            },
            json: true
        };

        rp(rp_options)
            .then(function(res) {
                var answer = res;
                var presentation_cards = [];
                var presentations = answer.presentations;
                var total_presentations = presentations.length;

                if(total_presentations > 1) {
                    session.send('I found the following talk by ' + answer.speaker_name);
                } else {
                    session.send('I found the following talks by ' + answer.speaker_name);
                }

                for( i = 0; i < total_presentations; i++) {
                    var card = new builder.HeroCard(session)
                        .title(presentations[i].presentation_name)
                        .subtitle(presentations[i].presentation_date)
                        .images([])
                        .buttons([
                            builder.CardAction.openUrl(session, presentations[i].presentation_link, 'View Details')
                        ]);
                        
                    presentation_cards.push(card);
                }

                var response = new builder.Message(session)
                    .textFormat(builder.TextFormat.plain)
                    .attachmentLayout(builder.AttachmentLayout.carousel)
                    .attachments(presentation_cards);
                
                session.send(response);
                next();
            })
            .catch(function(err) {
                session.send("Something went wrong.");
                next();
            });
    }, 
    function(session, next){
        var q = "Do you want to lookup another speaker?";
        builder.Prompts.choice(session, q, "Yes|No");
    },
    function(session, results, next){
        if (results.response && results.response.index === 0) {
            session.replaceDialog('/findSpeaker', {reprompt: true });
        } else {
            next();
        }
    },
    function(session, results, next) {
        session.endDialog();
    }
]);


//=========================================================
// QnA Dialogs
//=========================================================

// Tried to figure out how to use the cognitiveServices lib for this, but wasn't able to make it work with the other dialogs as envisioned
/*
var recognizer = new cognitiveServices.QnAMakerRecognizer({
    knowledgeBaseId: process.env.KB_ID,
    subscriptionKey: process.env.CS_SUBKEY
});

var basicQnAMakerDialog = new cognitiveServices.QnAMakerDialog({
    recognizers: [recognizer],
    defaultMessage: 'You stumped me. Try again.',
    qnaThreshold: 0.3
});

bot.dialog('/faq', [
    function(session) {
        builder.Prompts.text(session, "Type a question and I will phone up Shawn to get the answer.");
    },
    function(session, results, next) {
        session.beginDialog('/startQnA');
    }
]);

bot.dialog('/startQnA', basicQnAMakerDialog);
*/


bot.dialog('/faq', [
    function(session){
        builder.Prompts.text(session, "Type a question and I will phone up Shawn to get the answer.");
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
        var q = "Would you like me to ask Shawn another question?";
        builder.Prompts.choice(session, q, "Yup|Nope");
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


function isJson(item) {
    item = typeof item !== "string"
        ? JSON.stringify(item)
        : item;

    try {
        item = JSON.parse(item);
    } catch (e) {
        return false;
    }

    if (typeof item === "object" && item !== null) {
        return true;
    }

    return false;
}