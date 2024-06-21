//const sdk = require('node-appwrite');
const { Client, Databases, Query } = require('node-appwrite');
const express = require('express')
const axios = require('axios')
const nodemailer = require('nodemailer');
const moment = require('moment-timezone');

const bodyParser = require('body-parser');

const app = express()

// Use body-parser middleware to parse JSON payloads
app.use(bodyParser.json());

//Init SDK
//const client = new sdk.Client();

const client = new Client();

client
    .setEndpoint('https://bf2a562.online-server.cloud/v1') // 
    .setProject('63446724a6d27e696227') // 
    .setKey('blabla123xyz') // Your secret API key
    ;

const database = new Databases(client, '63446ca755a041305f7f');

// Define the HTML content in a variable
const mailBody = '<b>Event webhook received from VERKADA to VERBUX</b>';

let actCustomerNumberEbues;
let actEventCode;

// Create a transporterCustomer object using the SMTP transport
const transporterCustomer = nodemailer.createTransport({
    host: "mrvnet.kundenserver.de",
    port: 587, // or 25 if 587 is blocked
    secure: false, // true for 465, false for other ports
    auth: {
        user: "noreply@verbux.eu",
        pass: "Strcopy.1$verbux"
    },
    tls: {
        rejectUnauthorized: false
    }
});

// Create a transporterCustomer object using the SMTP transport , muss pro Leitstelle konf. werden können
const transporterAlarmcenter = nodemailer.createTransport({
    host: "178.254.36.28",
    port: 2525, // or 25 if 587 is blocked
    secure: false, // true for 465, false for other ports
    auth: {
        user: "system3",
        pass: "8g4D2_kdV6A4p"
    },
    tls: {
        rejectUnauthorized: false
    }
});



app.get("/", async (req, res) => {
    try {
        const response = await axios.get("https://m.myapp2go.de/services/API_get_keys")
        res.json(response.data)
    } catch (err) {
        console.log(err)
    }
})

app.get('/api/events', async (req, res) => {
    let data = await database.listDocuments('63446ca755a041305f7f', '635256b413c28b9de0c8'
        ,
        [
            Query.equal("KY_KEY", 'VERKADA'),
        ]
    );
    res.send(data.documents);
    console.log('api/ebents called!', data)
})

app.get('/ping', (req, res) => {
    const clientIp = getClientIp(req);
    const now = new Date();


    res.json({
        ip: clientIp,
        date: getCETTime(),
        status: 'alive'

    });
});


/* app.get('/api/mail', async (req, res) => {
    let data = await sendEmailCustomer('xxx')
    console.log('api/mail called!', data)
}) */

// Define the webhook endpoint
app.post('/webhook', async (req, res) => {
    const payload = req.body;
    console.log('Received webhook payload:', payload);

    if (isValidPayload(payload)) {

        try {

            // Wait for getCustomer and getEventAssignment to complete and fill important variables
            const [actCustomerNumberEbuesCheck, actEventCodeCheck] = await Promise.all([
                getCustomer(payload),
                getEventAssignment(payload)
            ]);

            // Wait for 0.5 seconds before calling sendEmailAlarmcenter
            await delay(1000);

            // Check if important variables are filled
            if (actCustomerNumberEbuesCheck && actEventCodeCheck) {
                // Proceed with other functions
                await Promise.all([
                    insertIncomingEventNew(payload),
                    sendEmailCustomer(payload),
                    sendEmailAlarmcenter(payload)
                ]);


                // After the delay, call sendEmailAlarmcenter
                //await sendEmailAlarmcenter(payload);

            } else {
                throw new Error('Important variables not filled');
            }

            console.log('Webhook processed successfully');
            res.status(200).send('Webhook received and processed');
        } catch (error) {
            console.error('Error processing webhook:', error);
            res.status(500).send('Internal Server Error');
        }
    } else {
        res.status(400).send('Invalid payload');
    }
});

async function sendEmailCustomer(pData) {

    console.log('in fct Send Message to Customer:  %s', getCurrentISOTime());

    // Convert payload to a string or formatted HTML if needed
    const payloadString = JSON.stringify(pData, null, 2).replace(/\n/g, '<br>'); // Formatting JSON payload as HTML

    // Setup email data
    const mailOptions = {
        from: '"VERBUX" <noreply@verbux.eu>', // sender address
        to: 'ralf.borde@icloud.com', // list of receivers
        subject: 'VERBUX event received ✔', // Subject line
        html: mailBody + '<br>' + payloadString// html body
    };

    // Send mail with defined transport object
    transporterCustomer.sendMail(mailOptions, (error, info) => {
        if (error) {
            return console.log(error);
        }
        console.log('Message sent: %s', info.messageId);
        console.log('Preview URL: %s', nodemailer.getTestMessageUrl(info));
    });

}

async function sendEmailAlarmcenter(pData) {

    console.log('in fct Send Message to AlarmCenter:  %s', getCurrentISOTime());


    // Convert payload to a string or formatted HTML if needed
    //const payloadString = JSON.stringify(pData, null, 2).replace(/\n/g, '<br>'); // Formatting JSON payload as HTML

    // Get the current date and time
    const now = new Date();

    // Convert to ISO 8601 format
    const utcDate = formatToUTC17(now);

    /*  FORMAT EBUES
      {
           "org_id": "a7a3b638-e95b-4f00-b26a-6620236c48d7",
           "webhook_type": "notification",
           "created_at": 1718634936,
           "webhook_id": "a2b0067f-c096-4bff-9d6a-5cd8a662a7fb",
         
           "data": {
             "device_id": "2d9a383f-5232-4302-b007-13143102b8b9",
             "created": 1718634933,
             "notification_type": "alert_rule_motion",
             "device_type": "camera",
             "camera_id": "2d9a383f-5232-4302-b007-13143102b8b9",
             "person_label": null,
             "objects": [],
             "crowd_threshold": null,
             "image_url": "https://vmotion.prod2.command.verkada.com/notifications/thumbnail?cameraId=2d9a383f-5232-4302-b007-13143102b8b9&eventId=577a0c06-bf28-40d6-9b7f-c1707b5ed30a&eventType=alert_rule_motion",
             "video_url": "https://command.verkada.com/cameras/2d9a383f-5232-4302-b007-13143102b8b9/history/86400/1718634933/?duration=86400&initialVideoTime=1718634933000"
           }
          */

    const payloadAlarmcenter = {
        "alarmCamera": pData.data.camera_id || pData.data.site_name,
        "alarmMessage": pData.data.event_type,
        "deviceId": pData.data.device_id,
        "eventProtocol": "VERBUX",
        "eventText": pData.data.notification_type,
        "eventTime": utcDate,
        "eventType": actEventCode,
        "eventId": pData.webhook_id,
        "eventURL": pData.data.image_url,
        "transmittername": actCustomerNumberEbues
    }

    // Convert payload to a formatted text string
    const payloadStringAlarmcenterText = `Alarm Camera: ${payloadAlarmcenter.alarmCamera}\n` +
        `Alarm Message: ${payloadAlarmcenter.alarmMessage}\n` +
        `Device ID: ${payloadAlarmcenter.deviceId}\n` +
        `Event Protocol: ${payloadAlarmcenter.eventProtocol}\n` +
        `Event Text: ${payloadAlarmcenter.eventText}\n` +
        `Event Time: ${payloadAlarmcenter.eventTime}\n` +
        `Event Type: ${payloadAlarmcenter.eventType}\n` +
        `Event ID: ${payloadAlarmcenter.eventId}\n` +
        `Event URL: ${payloadAlarmcenter.eventURL}\n` +
        `Transmitter Name: ${payloadAlarmcenter.transmittername}`;

    // Convert payload to a string or formatted HTML if needed
    //const payloadStringAlarmcenter = JSON.stringify(payloadAlarmcenter, null, 2).replace(/\n/g, '<br>'); // Formatting JSON payload as HTML

    console.log('Message to AlarmCenter:  %s', payloadStringAlarmcenterText);


    // Setup email data
    const mailOptionsAlarmcenter = {
        from: 'system3@ebues.local', // sender address
        to: 'alarmserver@ebues.local', // list of receivers
        subject: 'VERBUX to EBUES event test', // Subject line
        text: payloadStringAlarmcenterText// text body
        // text: payloadAlarmcenter
    };


    transporterAlarmcenter.sendMail(mailOptionsAlarmcenter, (error, info) => {
        if (error) {
            return console.log(error);
        }
        console.log('Message sent ID  : %s', info.messageId);
        console.log('Message sent info: %s', info);
        console.log('Preview URL: %s', nodemailer.getTestMessageUrl(info));

        // Call the async function when messageId is valid
        if (info.messageId) {
            try {
                // insertIncomingEvent(mailOptions); -- mail Protokoll insert
                console.log('Event inserted successfully.');
            } catch (err) {
                console.error('Failed to insert event:', err);
            }
        }

    });

}

// Validation function to check the payload
function isValidPayload(payload) {
    // Add your validation logic here
    // For example, checking for required fields
    return payload && payload.data;
}

function formatToUTC17(date) {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0'); // getUTCMonth is zero-based
    const day = String(date.getUTCDate()).padStart(2, '0');
    const hours = String(date.getUTCHours()).padStart(2, '0');
    const minutes = String(date.getUTCMinutes()).padStart(2, '0');
    const seconds = String(date.getUTCSeconds()).padStart(2, '0');

    return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
}

// Function to get client's IP address
function getClientIp(req) {
    const xForwardedFor = req.headers['x-forwarded-for'];
    if (xForwardedFor) {
        // x-forwarded-for header can contain multiple IP addresses in the format: "client IP, proxy 1 IP, proxy 2 IP", we need the first one.
        return xForwardedFor.split(',')[0].trim();
    }
    return req.connection.remoteAddress || req.socket.remoteAddress || (req.connection.socket ? req.connection.socket.remoteAddress : null);
}

function getCETTime() {
    return moment().tz('Europe/Berlin').format(); // CET timezone is Europe/Berlin
}

// Function to get current time in ISO 8601 format (UTC)
function getCurrentISOTime() {
    return new Date().toISOString(); // Returns current date and time in ISO 8601 format (UTC)
}

function generateRandomString(length) {
    const characters = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let result = '';

    for (let i = 0; i < length; i++) {
        const randomIndex = Math.floor(Math.random() * characters.length);
        result += characters.charAt(randomIndex);
    }

    return result;
}

// Function to wait for a specified amount of time
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}


/* async function getKeys() {
    try {
        const response = await axios.get('https://m.myapp2go.de/services/API_get_keys');
        const data = response.data.items.map(value => ({

            KY_KEY: value.KY_KEY,
            KY_VALUE: value.KY_VALUE,
            KY_TEXT: value.KY_TEXT

        }));
        console.log("mapped in array: ", data);

        return data;
        //res.send(data);
    } catch (e) {
        console.log(e.message);
    }
}
 */
/* async function migrateDatabase() {
    try {
        const migKeys = await getKeys(); // get a key-array with map from getKeys()

        migKeys.forEach(async (element) => {
            try {
                console.log("key array ID --> : ", element.KY_KEY, element.KY_VALUE, element.KY_TEXT);
                await database.createDocument('63446ca755a041305f7f', '635256b413c28b9de0c8', 'unique()', {

                    'KY_KEY': element.KY_KEY,
                    'KY_VALUE': element.KY_VALUE,
                    'KY_TEXT': element.KY_TEXT

                })

            } catch (e) {
                console.log(e.message)
            }
        });
    } catch (e) {
        console.log(e.message);
    }
}
 */
async function insertIncomingEvent(pPayload) {
    try {

        const payload_stringified = JSON.stringify(pPayload);

        try {
            console.log("array payload: --> : ", pPayload);
            console.log("array payload org_id --> : ", pPayload.org_id);

            await database.createDocument('63446ca755a041305f7f', '635256b413c28b9de0c8', 'unique()', {

                'KY_KEY': 'VERKADA',
                'KY_VALUE': pPayload.org_id,
                'KY_TEXT': pPayload.webhook_type + ' - ' + pPayload.data.most_extreme_value,
                'KY_JSON': payload_stringified

            })

        } catch (e) {
            console.log(e.message)
        }

    } catch (e) {
        console.log(e.message);
    }
}

async function insertIncomingEventNew(pPayload) {
    try {


        const payload_stringified = JSON.stringify(pPayload);

        // Convert created_at to string
        const createdAtString = pPayload.created_at.toString();

        // Check if event_type is present in pPayload.data
        const eventType = pPayload.data && pPayload.data.event_type ? pPayload.data.event_type : 'n/a';

        // Check device_id is present in pPayload.data
        const deviceId = pPayload.data && pPayload.data.device_id ? pPayload.data.device_id : 'n/a';

        const uuid = generateRandomString(10);

        console.log('uuid . ', uuid);

        try {
            console.log("array payload: --> : ", pPayload);
            console.log("array payload org_id --> : ", pPayload.org_id);

            await database.createDocument('63446ca755a041305f7f', '667456dc461c363814ad', 'unique()', {

                'event_id': uuid,
                'org_id': pPayload.org_id,
                'webhook_type': pPayload.webhook_type,
                'created_at': createdAtString,
                'webhook_id': pPayload.webhook_id,
                'event_type': eventType,
                'event_json': payload_stringified,
                'event_date': getCurrentISOTime(),
                'event_cd1': deviceId,
                'event_cd2': ''

            })


            console.log('event_incoming insert OK : ');

        } catch (e) {
            console.log(e.message)
        }

    } catch (e) {
        console.log(e.message);
    }
}


/* Query.equal("KY_VALUE", this.actOrg_id), */
async function getCustomer(pPayload) {

    console.log('in fct get Customer:  %s', getCurrentISOTime());

    const promise = database.listDocuments('63446ca755a041305f7f', '63446cd877f69df94aca',
        [

            Query.equal("org_id", pPayload.org_id),
            Query.orderDesc("$createdAt")

        ]);

    promise.then((response) => {

        console.log("response customer: ", response); // Success

        if (response.documents.length > 0) {
            actCustomerNumberEbues = response.documents[0].number;
            console.log("actCustomerNumberEbues: ", actCustomerNumberEbues); // Store the number

            return actCustomerNumberEbues;

        } else {
            console.log("No customer found !");
        }


    }, function (error) {
        console.log(error); // Failure
    });

}

async function getEventAssignment(pPayload) {

    console.log('in fct get event assignment:  %s', getCurrentISOTime());

    // Check if event_type is present in pPayload.data
    const eventTypeQuery = pPayload.data && pPayload.data.event_type
        ? Query.equal("event_type", pPayload.data.event_type)
        : Query.equal("event_type", "n/a");

    const promise = database.listDocuments('63446ca755a041305f7f', '66740c9f3880e296bf97',
        [

            Query.equal("webhook_type", pPayload.webhook_type),
            eventTypeQuery
            /*  Query.equal("event_type", pPayload.data.event_type)
  */

        ]);

    promise.then((response) => {

        console.log("response event_assignment: --->  ", response); // Success

        if (response.documents.length > 0) {

            actEventCode = response.documents[0].event_code;

            console.log("actEventCode: ", actEventCode); // Store the code

            return actEventCode;

        } else {
            console.log("No event assinment found !");
        }


    }, function (error) {
        console.log(error); // Failure
    });

}

/* (async() => {
    await getKeys();
})();
 */


// sendEmailCustomer('xxx');


app.get('*', (req, res) => {
    //res.status(500).json({ message: "error" })
    res.status(404).json({ message: "route Not Found" });
})

/*  app.listen(3080) // or other ports */

// Define the port to listen on
const PORT = process.env.PORT || 3080;

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});