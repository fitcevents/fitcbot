/**
 * FITC Chat Bot
 * Authors: Rami Sayer and Rick Mason
 * 
 * Note: lots of node BotBuilder samples here: https://github.com/Microsoft/BotBuilder-Samples/tree/master/Node
 */

var restify = require('restify');
var builder = require('botbuilder');
var cognitiveServices = require('botbuilder-cognitiveservices');
var request = require('request');
var rp = require('request-promise');
var dotenv = require('dotenv');

// Load ENV variables
dotenv.load();

/**
 * Bot Setup
 */

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


/**
 * Home Dialog
 */

bot.dialog('/', [
    function (session, args) {
        var q = "Hello! I can answer questions about presentations, general questions about the event or show you a picture of a cute cat?";
        
        if ( args && args.reprompt ) {
            q = "Anything else I can help with?";
        }
        
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
                session.beginDialog('/cats');
            }
        } else {
           next();
        }
    }, function(session, results, next){
        session.replaceDialog('/');
    }
]);

/**
 * Get some cat photos!s
 */
bot.dialog('/cats', [
    function(session){
        session.send("You want cats? I've got cats!");
        session.sendTyping();

        var random = getRandomInt(1,10000); // note: api request was getting cached, adding random param fixed it

        var card = new builder.HeroCard(session)
            .title('Cute Cat!')
            .subtitle('Shawn loves cats.')
            .images([
                builder.CardImage.create(session, 'http://thecatapi.com/api/images/get?format=src&type=gif&size=med&rando=' + random)
            ]);

        var msg = new builder.Message(session).addAttachment(card);
        session.send(msg);

        card = null;

        session.replaceDialog('/', {reprompt: true });
    }
]);

/**
 * Presentations Dialog
 */
bot.dialog('/presentations', [
    function(session){
        var q = "I can answer these questions about presentations:"
        builder.Prompts.choice(session, q, [
            "What presentations are up next?",
            "What presentations happening right now?",
            "When is a particular speaker's talk?"
        ],
        {
            maxRetries: 3,
            retryPrompt: 'Ooops, what you wrote is not a valid option, please try again.'
        });
    },
    function(session, results, next) {
        if (results.response) {
            if(results.response.index === 0){
                session.beginDialog('/nextPresentations');
            }
            else if (results.response.index === 1){
                session.beginDialog('/currentPresentations');
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

/**
 * Find a speaker
 * 
 * Does a keyword search on speaker names to see what presentations can be found
 */
bot.dialog('/findSpeaker', [
    function(session, next) {
        builder.Prompts.text(session, "What's the name of the speaker you are looking for?");
    },
    function(session, results, next) {
        session.send('Let me see what I can find about "%s"', results.response);
        session.sendTyping();

        var rp_options = {
            uri: process.env.FITC_API_ROOT + '/services/search/speaker/' + encodeURIComponent(results.response),
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
        session.replaceDialog('/', {reprompt: true });
    }
]);

/**
 * Current presentations
 * 
 * Hit up the api to try and find what talks are currently happening
 */
bot.dialog('/currentPresentations', [
    function(session, results, next) {
        var insults = [
            "Did you sleep in?",
            "Drank too much last night?",
            "Have something against the current speaker?",
            "You mean you didn't preplan your whole day like I did?",
            "Did you lose your schedule?"
        ];
        
        session.send(insults[Math.floor(Math.random() * insults.length)]);
        session.send("One sec, I'll figure out what's on now.");
        session.sendTyping();

        var rp_options = {
            uri: process.env.FITC_API_ROOT + '/services/search/schedule/current',
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

                if(total_presentations > 0) {
                    var talks = total_presentations > 1 ? 'talks' : 'talk';
                    session.send('I found ' + total_presentations + ' ' + talks + ' happening right now.');
                } else {
                    session.send('Sorry, I could not find any presentations on the schedule right now.');
                    next();
                }

                for( i = 0; i < total_presentations; i++) {
                    var presentation = presentations[i];
                    var card = new builder.HeroCard(session)
                        .title(presentation.presentation_name)
                        .text(presentation.presentation_start_time + ' in ' + presentation.presentation_location)
                        .images([])
                        .buttons([
                            builder.CardAction.openUrl(session, presentation.presentation_link, 'View Details')
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
    function(session, results, next) {
        session.replaceDialog('/', {reprompt: true });
    }
]);

/**
 * Next presentations
 * 
 * Hit up the api to try and find what talks are next.
 */
bot.dialog('/nextPresentations', [
    function(session, results, next) {
        session.send("Nice to see you planning ahead. Hang on while I figure out what's next.");
        session.sendTyping();

        var rp_options = {
            uri: process.env.FITC_API_ROOT + '/services/search/schedule/next',
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

                if(total_presentations > 0) {
                    var talks = total_presentations > 1 ? 'some talks' : 'one talk';
                    session.send('I found ' + talks + ' coming up for you at ' + answer.time_slot);
                } else {
                    session.send('Sorry, I could not find any more presentations on the schedule right now.');
                    next();
                }

                for( i = 0; i < total_presentations; i++) {
                    var presentation = presentations[i];
                    var card = new builder.HeroCard(session)
                        .title(presentation.presentation_name)
                        .text('Starts at ' + presentation.presentation_start_time + ' in ' + presentation.presentation_location)
                        .images([])
                        .buttons([
                            builder.CardAction.openUrl(session, presentation.presentation_link, 'View Details')
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
    function(session, results, next) {
        session.replaceDialog('/', {reprompt: true });
    }
]);


/** 
 * QnA Dialogs
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
                session.replaceDialog('/', {reprompt: true });
            } else {
                next();
            }
         } else {
             next();
         }
    }
]);

function getRandomInt(min, max) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min)) + min;
}
