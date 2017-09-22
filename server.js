'use strict'

const express = require('express')
const Slapp = require('slapp')
const ConvoStore = require('slapp-convo-beepboop')
const Context = require('slapp-context-beepboop')
const yaml = require('js-yaml')
const fs = require('fs')
const _ = require('lodash')
const handleHowAreYou = 'handleHowAreYou';
const handleSweetDreams = 'handleSweetDreams';
// use `PORT` env var on Beep Boop - default to 3000 locally
var port = process.env.PORT || 3000

var slapp = Slapp({
  // Beep Boop sets the SLACK_VERIFY_TOKEN env var
  verify_token: process.env.SLACK_VERIFY_TOKEN,
  convo_store: ConvoStore(),
  context: Context()
})

var Monitor = require('icecast-monitor');

var monitor = new Monitor({
  host: 'radio.radiospiral.net',
  port: 8000,
  user: 'admin',
  password: 'Pa55w0rd'
});

// Load oblique strategies
var strategies;
try {
  strategies = yaml.safeLoad(fs.readFileSync('strategies.yml', 'utf8'));
  console.log(strategies[0]);
} catch(e) {
  console.log("Failed to load Oblique Strategies: " + e);
}

// enable debugging
require('beepboop-slapp-presence-polyfill')(slapp, { debug: true })

var HELP_TEXT = `
I will respond to the following messages:
\`help\` - to see this message.
\`track\` - to see what the current track is.
\`peak\` - report on the peak listener count.
\`history\` - to get a list of previously played tracks.
\`strategy\` - to get a random Oblique Strategy.
I am very polite as well.
`

// *********************************************
// Setup different handlers for messages
// *********************************************

const stopper = `I wasn't listening...`
var previousTrack = `Nil`
var currentTrack = stopper
var testTrack = `Nol`
var numListeners = 0
var trackHistory = []
var numTracks = 0
var maxTracks = 10
var histIndex = 0
var savedToken = null;

monitor.createFeed(function(err, feed) {
  if (err) throw err;

  // Handle wildcard events
  //feed.on('*', function(event, data, raw) {
  //  console.log(event, data, raw);
  // });
  // Handle listener change
  feed.on('mount.listeners', function(listeners, raw) {
    numListeners = raw;
    console.log(listeners, raw);
  });
  // Handle track title change here

  feed.on('mount.title', function(title, track) {
    console.log('Now playing: ' + track);         // for debugging right now. should mean the track has changed
    testTrack = track;                            // not sure what type track is, so force it to a string
    if (currentTrack !== testTrack) {
      //console.log(currentTrack + " is not equal to " + testTrack);    // debug, they aren't equal, so yes
      numTracks = numTracks + 1;                  // to set a limit on history size we have to count tracks
      previousTrack = currentTrack;               // save the no longer current track as the previous
      currentTrack = track;                       // now store the current track
      trackHistory = _.concat(trackHistory,previousTrack);  // save previous track
      if (numTracks > maxTracks) {
        trackHistory = _.drop(trackHistory);
        numTracks = maxTracks;
      }
      // Post the track in now-playing
      // slackToken should have been set already; skip if not
      if (savedToken !== null) {
        console.log('trying to hit #now-playing...');
        let payload = Object.assign({
          token: savedToken,
          channel: '#now-playing'
         }, 'Now playing: ' + currentTrack);
        slapp.client.chat.postMessage(payload, (err, data) => {
          if (err) console.log('Error posting message ', err, data)
        });
      }
    } else {
      console.log('**dupEvent ' + currentTrack + ' is equal to ' + testTrack);

    }

    console.log('previous: ' + previousTrack);    //debugging some more here

    histIndex = numTracks;

    while (histIndex > 0) {
    console.log('track history: ' + trackHistory[histIndex]); //works, backwards I think
      histIndex = histIndex - 1;
    }

//    slapp.use((track, next) => {
//        console.log(track)
//        msg.say('Now playing: ' + track);
//        next()
//    })
   // message.say('Now playing: ' + track);
  });
});

// handle changed messages (don't know what to do with this yet)

//slapp.event('message_changed', (msg) => {
//  let token = msg.meta.bot_token
//  let id = msg.body.event.item.ts
//  let channel = msg.body.event.item.channel
//  slapp.client.reactions.add({token, 'smile', id, channel}, (err) => {
//   if (err) console.log('Error adding reaction', err)
//  })
//})


// Capture the Slack token in the 'hello' event so we can reuse it later.
slapp.event('hello', (msg) => {
  savedToken = msg.meta.bot_token;
  console.log("Stashed 'hello' token");
});

// response to the user typing "help"
slapp.message('help', ['mention', 'direct_message'], (msg) => {
  msg.say(HELP_TEXT)
})

slapp.message(/track|playing|hearing|tune|listening|music/i, ['mention', 'direct_message'], (msg) => {
  //msg.say("Sorry, my ears are broken.");
  //return;
        msg.say('Now playing: ' + currentTrack + ' (' + numListeners + ' listening)');
        msg.say('Previous: ' + previousTrack);

 })

slapp.message(/history|played/i, ['mention', 'direct_message'], (msg) => {

    histIndex = numTracks;
    if (trackHistory === null) {
        trackHistory = [stopper]
    }
    if (trackHistory.length === 1 && trackHistory[0] === stopper && currentTrack !== null) {
      trackHistory = [currentTrack]
    }
    if (trackHistory > 0) {
        if (currentTrack != null && _.last(trackHistory) != currentTrack) {
            trackHistory = _.concat(trackHistory, currentTrack)
        }
    }
    console.log(trackHistory)
    var sawNonStopper = false
    var first = true
    msg.say('What has played recently:')
    _.eachRight(trackHistory, function(value) {
      if (value !== stopper) {
        sawNonStopper = true
        if (first) {
            value = value + " (now playing)"
            first = false
        }
        msg.say(value)
      } else {
        if (!sawNonStopper) {
          msg.say(value)
          return
        }
      }
    })
})

slapp.message(/oblique|strateg(y|ies)/i, ['mention', 'direct_message'], (msg) => {
    msg.say(_.sample(strategies))
})

slapp.message(/\b(hi|hey|hoi|yo|hai|hello|howdy|greetings|sup|good\s+(morning|day|afternoon|evening))\b/i, ['mention', 'direct_message'], (msg) => {
  msg.say(['hi there, how are you?','Heya, how\'s you?','sup dude','yo wassup','hello ambient, how are you?'])
   .route('handleHowAreYou')  // where to route the next msg in the conversation
})

slapp.message(/bye|nite|night|later|vista|goodbye|dreams|see you|bai|good night|ttfn|syl|nini/i, ['mention', 'direct_message'], (msg) => {
  msg.say(['Goodnight :zzz:','see you soon? :blush:','take it easy then','cheers mate','sweet dreams :star2:','nini...'])
   .route('handleSweetDreams')  // where to route the next msg in the conversation
})

slapp.message(/(T|t)hank( |s|y|ies)|cheers|ty/i, ['mention', 'direct_message'], (msg) => {
     if (Math.random() < 0.98) {
    msg.say(['No problem!', 'You are welcome!', 'Happy to help!', 'de nada!', 'My pleasure!', ':pray:', ':raised_hands:', 'cool'])
     }
})

slapp.message('peak', ['mention', 'direct_message'], (msg) => {
  monitor.createStatsXmlStream('/admin/stats', function(err, xmlStream) {
  if (err) throw err;

    var xmlParser = new Monitor.XmlStreamParser();

    xmlParser.on('error', function(err) {
      console.log('error', err);
    });

    var xmlParser = new Monitor.XmlStreamParser();

    xmlParser.on('source', function(source) {
      msg.say('Listener peak was ' + source.listenerPeak + ' since ' + source.streamStart);
    });

  // Finish event is being piped from xmlStream
    xmlParser.on('finish', function() {
    //console.log('all sources are processed');
    });

    xmlStream.pipe(xmlParser);
  });

})

//

// register a route handler
slapp.route('handleHowAreYou', (msg) => {
  // respond with a random entry from array
  msg.say(['I feel that way sometimes too', 'Yeah me too', 'Cool', 'well hang in there.', 'sweet','sigh','Could be worse.'])
})

slapp.route('handleSweetDreams', (msg) => {
  // respond with a random entry from array
  msg.say([':crescent_moon:', ':first_quarter_moon_with_face:', ':heart:', ':sleeping:', ':zzz:',':dizzy:',':sparkles:'])
})

// Catch-all for any other responses not handled above
slapp.message('.*', ['direct_mention', 'direct_message'], (msg) => {
  // respond only 90% of the time
  console.log('someone said something');
  if (Math.random() < 0.9) {
    msg.say([':wave:', ':pray:', ':raised_hands:', 'word.', ':wink:', 'Did you say something?',':innocent:',':hankey:',':smirk:'])
  }
})

// attach Slapp to express server
var server = slapp.attachToExpress(express())

// start http server
server.listen(port, (err) => {
  if (err) {
    return console.error(err)
  }

  console.log(`Listening on port ${port}`)
});

