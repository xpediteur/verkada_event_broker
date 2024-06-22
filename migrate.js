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

// Define an array of valid webhook_type values
let validWebhookTypes = [];

// Send to Alarmcenter on/off !!!
const isSendMailToAlarmCenter = false;

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
    console.log('api/enents called!', data)
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


// main webhook endpoint
app.post('/webhook/:cnumber', async (req, res) => {

    const payload = req.body;

    console.log('\r\nReceived webhook payload: -->', payload);

    const cnumber = req.params.cnumber;
    console.log('\r\nExtracted number from webhook: -->', cnumber);

    const vbxParameters = await getKeys(); //
    const lenvbxParameters = vbxParameters.length;

    // Extract vbx_value into a new array
    validWebhookTypes = vbxParameters.map(doc => doc.vbx_value);


    console.log('\r\nin fct keys test count: ', lenvbxParameters);

    console.log('\r\n validWebhookTypes : ', validWebhookTypes);


    if (isValidPayload(payload)) {

        try {
            // Wait for getCustomer and getEventAssignment to complete and fill important variables
            const [actCustomerNumberEbuesCheck, actEventCodeCheck] = await Promise.all([
                getCustomer(payload),
                getEventAssignment(payload)
            ]);

            // Check if cnumber is corresponding to customer number
            if (cnumber == actCustomerNumberEbues) {

                // Check if important variables are filled
                if (actCustomerNumberEbuesCheck && actEventCodeCheck) {
                    // Proceed with other functions
                    await Promise.all([
                        insertIncomingEventNew(payload),
                        sendEmailCustomer(payload),
                        sendEmailAlarmcenter(payload)
                    ]);

                    console.log('\r\nWebhook processed successfully');
                    res.status(200).send('Webhook received and processed');
                } else {
                    throw new Error('Important variables in webhook not filled');
                }
            } else {
                res.status(500).send('no customer service available with this number');
                console.log('\r\nInvalid customer number: ', cnumber);
                await insertErrorLog(payload, 'no customer service available with this number', 'CUSTOMERCHECK')
            }

        } catch (error) {
            console.error('Error processing webhook:', error);
            await insertErrorLog(payload, 'Error processing webhook', 'TECHNIQUE');
            res.status(500).send('Internal Server Error');
        }
    } else {
        res.status(400).send('Invalid payload or webhook_type');
        console.log('\r\nInvalid payload or webhook_type');
        await insertErrorLog(payload, 'Invalid payload or webhook_type', 'PAYLOAD')
    }
});



async function sendEmailCustomer(pData) {
    console.log('in fct Send Message to Customer:  %s', getCurrentISOTime());

    const payloadString = JSON.stringify(pData, null, 2).replace(/\n/g, '<br>'); // Formatting JSON payload as HTML

    const mailOptions = {
        from: '"VERBUX" <noreply@verbux.eu>',
        to: 'ralf.borde@icloud.com',
        subject: 'VERBUX event received ✔',
        html: mailBody + '<br>' + payloadString
    };

    try {
        let info = await transporterCustomer.sendMail(mailOptions);
        console.log('\r\nMessage sent to customer: %s', info.messageId);
        console.log('\r\nPreview URL: %s', nodemailer.getTestMessageUrl(info));
    } catch (error) {
        console.log(error);
        await insertErrorLog(pData, 'Customer email not sent ' + info.messageId, 'MAIL')
    }
}

async function sendEmailAlarmcenter(pData) {
    console.log('in fct Send Message to AlarmCenter:  %s', getCurrentISOTime());

    const now = new Date();
    const utcDate = formatToUTC17(now);

    const payloadAlarmcenter = {
        "alarmCamera": pData.data.camera_id || pData.data.site_name,
        "alarmMessage": pData.data.event_type,
        "deviceId": pData.data.device_id,
        "eventProtocol": "VERBUX",
        "eventText": pData.data.device_name || pData.data.site_name,
        "eventTime": getUNIXTime(),  //utcDate
        "eventType": actEventCode,
        "eventId": pData.webhook_id,
        "eventURL": pData.data.image_url || 'n/a',
        "transmittername": actCustomerNumberEbues
    }

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

    console.log('\r\nMessage to AlarmCenter: \r\n %s', payloadStringAlarmcenterText);

    const mailOptionsAlarmcenter = {
        from: 'system3@ebues.local',
        to: 'alarmserver@ebues.local',
        subject: 'VERBUX to EBUES event test',
        text: payloadStringAlarmcenterText
    };

    if (isSendMailToAlarmCenter) {

        try {
            let info = await transporterAlarmcenter.sendMail(mailOptionsAlarmcenter);
            console.log('Message sent to alatmcenter : %s', info.messageId);
            console.log('Message sent info: %s', info);
            console.log('Preview URL: %s', nodemailer.getTestMessageUrl(info));

            if (info.messageId) {
                try {
                    console.log('Event inserted successfully to HELIX.');
                } catch (err) {
                    console.error('Failed to insert event in HELIX:', err);
                }
            }
        } catch (error) {
            console.log(error);
            await insertErrorLog(pData, 'Alarcenter email not sent ' + info.messageId, 'MAIL')
        }

    }

}

// Function to validate payload
function isValidPayload(payload) {
    return payload && payload.data && validWebhookTypes.includes(payload.webhook_type);
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


// Function to get current UNIX time
function getUNIXTime() {

    const currentDate = new Date();
    const unixTimestamp = Math.floor(currentDate.getTime() / 1000);
    return unixTimestamp

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


async function getKeys() {
    try {

        let data = await database.listDocuments('63446ca755a041305f7f', '66766dc74a19c923137a'
            ,
            [
                Query.equal("vbx_key", 'WEBHOOK_TYPES'),
            ]
        );

        return data.documents;
        //res.send(data);
    } catch (e) {
        console.log(e.message);
    }
}

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
        const createdAtString = pPayload.created_at.toString();
        const eventType = pPayload.data && pPayload.data.event_type ? pPayload.data.event_type : 'n/a';
        const deviceId = pPayload.data && pPayload.data.device_id ? pPayload.data.device_id : 'n/a';
        const uuid = generateRandomString(10);

        console.log('uuid . ', uuid);
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
        });

        console.log('\r\n event_incoming insert OK : ');
    } catch (e) {
        console.log(e.message);
    }
}

async function insertErrorLog(pPayload, pMessage, pType) {
    try {

        const payload_stringified = JSON.stringify(pPayload);

        //const logType = pPayload.org_id && pPayload.data.device_id ? pPayload.data.device_id : 'n/a';

        const uuid = generateRandomString(10);

        /* yyy */

        await database.createDocument('63446ca755a041305f7f', '667698d85d98f40d9f97', 'unique()', {
            'log_id': uuid,
            'log_date': getCurrentISOTime(),
            'log_sender': pPayload.org_id || 'n/a',
            'log_message': pMessage,
            'log_type': pType,
            'log_json': payload_stringified

        });

        console.log('\r\n error log insert OK : ');
    } catch (e) {
        console.log(e.message);
    }
}


/* Query.equal("KY_VALUE", this.actOrg_id), */
async function getCustomer(pPayload) {
    console.log('in fct get Customer:  %s', getCurrentISOTime());

    try {
        const response = await database.listDocuments('63446ca755a041305f7f', '63446cd877f69df94aca', [

            Query.equal("org_id", pPayload.org_id),
            Query.orderDesc("$createdAt")

        ]);

        console.log("response customer: ", response); // Success

        if (response.documents.length > 0) {
            actCustomerNumberEbues = response.documents[0].number;
            console.log("actCustomerNumberEbues: ", actCustomerNumberEbues); // Store the number
            return actCustomerNumberEbues;
        } else {
            console.log("No customer found !");
            return null;
        }
    } catch (error) {
        console.log(error); // Failure
        return null;
    }
}

async function getEventAssignment(pPayload) {
    console.log('in fct get event assignment:  %s', getCurrentISOTime());

    const eventTypeQuery = pPayload.data && pPayload.data.event_type
        ? Query.equal("event_type", pPayload.data.event_type)
        : Query.equal("event_type", "n/a");

    try {
        const response = await database.listDocuments('63446ca755a041305f7f', '66740c9f3880e296bf97', [
            Query.equal("webhook_type", pPayload.webhook_type),
            eventTypeQuery
        ]);

        console.log("response event_assignment: --->  ", response); // Success

        if (response.documents.length > 0) {
            actEventCode = response.documents[0].event_code;
            console.log("actEventCode: ", actEventCode); // Store the code
            return actEventCode;
        } else {
            console.log("No event assignment found !");
            return null;
        }
    } catch (error) {
        console.log(error); // Failure
        return null;
    }
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
