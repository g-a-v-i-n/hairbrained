require('dotenv').config()
const needle = require('needle');
const twilio = require('twilio')

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioClient = twilio(accountSid, authToken);

// The code below sets the bearer token from your environment variables
// To set environment variables on Mac OS X, run the export command below from the terminal: 
// export BEARER_TOKEN='YOUR-TOKEN'
const token = process.env.BEARER_TOKEN;  

const rulesURL = 'https://api.twitter.com/2/tweets/search/stream/rules'
const streamURL = 'https://api.twitter.com/2/tweets/search/stream';

// Edit rules as desired here below
const rules = [
    { 'value': 'from:coinbase' },
    { 'value': 'from:coinbasepro' }, 
    { 'value': `from:${process.env.TEST_ACCT}` }, 
  ];

const matchAny = [
    'testcode',
    'launching on',
    'in the next 15 minutes',
    'You may need to refresh your app',
    'is now live at',
    'buy, sell, convert, send, receive, or store',
]

function test(json) {
    
    const hasMatch = matchAny.filter(entry => json.data.text.includes(entry) === true)

    if (hasMatch.length > 0) {
        sendAlert()
        console.log('Sent Alert')
    } else {
    	console.log('No Match')
    }
}

async function sendAlert() {
    twilioClient.messages
      .create({body: 'ALERT: New coin on Coinbase. https://www.coinbase.com', from: process.env.FROM_PHONE, to: process.env.TO_PHONE})
      .then(message => console.log(message.sid));
}

async function getAllRules() {

    const response = await needle('get', rulesURL, { headers: {
        "authorization": `Bearer ${token}`
    }})

    if (response.statusCode !== 200) {
        throw new Error(response.body);
        return null;
    }

    return (response.body);
}

async function deleteAllRules(rules) {

    if (!Array.isArray(rules.data)) {
        return null;
      }

    const ids = rules.data.map(rule => rule.id);

    const data = {
        "delete": {
            "ids": ids
        }
    }

    const response = await needle('post', rulesURL, data, {headers: {
        "content-type": "application/json",
        "authorization": `Bearer ${token}`
    }}) 

    if (response.statusCode !== 200) {
        throw new Error(response.body);
        return null;
    }
    
    return (response.body);

}

async function setRules() {

    const data = {
        "add": rules
      }

    const response = await needle('post', rulesURL, data, {headers: {
        "content-type": "application/json",
        "authorization": `Bearer ${token}`
    }}) 

    if (response.statusCode !== 201) {
        throw new Error(response.body);
        return null;
    }
    
    return (response.body);

}

function streamConnect() {
    //Listen to the stream
    const options = {
        timeout: 20000
      }
    
    const stream = needle.get(streamURL, {
        headers: { 
            Authorization: `Bearer ${token}`
        }
    }, options);

    stream.on('data', data => {
    try {
        const json = JSON.parse(data);
        test(json)
        console.log(json);
    } catch (e) {
        // Keep alive signal received. Do nothing.
    }
    }).on('error', error => {
        if (error.code === 'ETIMEDOUT') {
            stream.emit('timeout');
        }
    });

    return stream;
    
}


(async () => {
    let currentRules;
  
    try {
      // Gets the complete list of rules currently applied to the stream
      currentRules = await getAllRules();
      
      // Delete all rules. Comment the line below if you want to keep your existing rules.
      await deleteAllRules(currentRules);
  
      // Add rules to the stream. Comment the line below if you don't want to add new rules.
      await setRules();
      
    } catch (e) {
      console.error(e);
      process.exit(-1);
    }
  
    // Listen to the stream.
    // This reconnection logic will attempt to reconnect when a disconnection is detected.
    // To avoid rate limites, this logic implements exponential backoff, so the wait time
    // will increase if the client cannot reconnect to the stream.
  
    const filteredStream = streamConnect()
    let timeout = 0;
    filteredStream.on('timeout', () => {
      // Reconnect on error
      console.warn('A connection error occurred. Reconnecting…');
      setTimeout(() => {
        timeout++;
        streamConnect(token);
      }, 2 ** timeout);
      streamConnect(token);
    })

  })();