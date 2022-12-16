'use strict';

const express = require('express');
const mqtt = require('mqtt');
require('dotenv').config();
const { MongoClient } = require("mongodb");

const line = require("@line/bot-sdk");
const ngrok = require("ngrok");

console.log(process.env.MONGODB_URI);

// Constants
const PORT = 8080;
const HOST = '0.0.0.0';

// LINE
const line_cfg = {
    channelAccessToken: process.env.LINE_ACCESS_TOKEN,
    channelSecret: process.env.LINE_CH_SECRET,
}
const lineClient = new line.Client(line_cfg);


// App
var data_idx = 0;
var humid_value = 0;
var temp_value = 0;

const app = express();

app.get('/', async (req, res) => {
    const value = parseInt(req.query.value)
    const results = await try_query(value)
    const summary = results.map(a => a.timestamp)
    console.log(summary)
    res.send(summary.toString());
    // res.send(summary.toString());
});

app.use('/liff', express.static('liff'))

app.get('/api/sensor', async (req, res) => {
    const ans = { idx: data_idx, temp: temp_value, humid: humid_value }
    res.send(JSON.stringify(ans))

})


app.post('/webhook', line.middleware(line_cfg), (req, res) => {
    Promise
        .all(req.body.events.map(handleEvent))
        .then((result) => res.json(result));
});



//MQTT
// const mqttclient = mqtt.connect('mqtt://cn466test-mosquitto-1');
// const mqttclient = mqtt.connect('mqtt://broker.hivemq.com');
// const mqttclient = mqtt.connect('a34f8a21eec44811b9476e67fbebdbc5.s2.eu.hivemq.cloud');
var Connect_options = {
    host: 'a34f8a21eec44811b9476e67fbebdbc5.s2.eu.hivemq.cloud',
    port: 8883,
    protocol: 'mqtts',
    username: 'gohza',
    password: '123456789'
}

const mqttclient = mqtt.connect('mqtt://broker.hivemq.com'); // เชื่อมต่อ cloud broker
// const mqttclient = mqtt.connect('mqtt://cn466test-hivemq-1'); // เชื่อมต่อ local broker
mqttclient.on('connect', function () {
    mqttclient.subscribe('cn466/sensor', function (err) {
        if (!err) {
            // const obj = { status: 'ok' };
            // mqttclient.publish('cn466/status', JSON.stringify(obj))
            console.log("เชื่อมต่อ broker สำเร็จ")
        }
    })

})
mqttclient.on('message', function (topic, message) {
    // message is Buffer
    console.log(message.toString());
    const msg = JSON.parse(message.toString());
    try_insert(msg).catch(console.dir);
    data_idx = data_idx + 1;
    const temp_value = parseFloat(msg.temperature).toFixed(2);
    const humid_value = parseFloat(msg.humidity).toFixed(2);
    const pressure_value = parseFloat(msg.pressure).toFixed(2);

    var context =
        `อุณหภูมิ : ${temp_value}
ความชื้น : ${humid_value}
ความกดอากาศ : ${pressure_value}`;
    // lineClient.pushMessage(process.env.USER_ID, { type: 'text', text: context.toString() })



})


//database
const mongodbClient = new MongoClient(process.env.MONGODB_URI);

async function try_connect() {
    try {
        await mongodbClient.connect();
        const database = mongodbClient.db('cn466');
        try {
            await database.createCollection('sensor')
            console.log("Collection created")
        } catch (err) {
            console.log("Collection existed")
        }
    } finally {
        await mongodbClient.close()
    }
}
try_connect().catch(console.dir);


async function try_insert(value) {
    try {
        await mongodbClient.connect();
        const database = mongodbClient.db('cn466');
        const sensor = database.collection('sensor');
        const doc = {
            temperature: value.temperature,
            humidity: value.humidity,
            pressure: value.pressure,
            timestamp: new Date().toLocaleString('en-US', {
                timeZone: 'Asia/Bangkok',
            }),
        }
        console.log("added into database")
        // console.log(doc);
        const result = await sensor.insertOne(doc);
        // console.log(result);
    }
    finally {
        await mongodbClient.close();
    }
    /*console.log(results)
    return results*/
}

async function try_query(value) {
    var results = []
    try {
        await mongodbClient.connect();
        const database = mongodbClient.db('cn466');
        const sensor = database.collection('sensor')
        const cond = { value: value }
        results = await sensor.find(cond).toArray()
    } finally {
        await mongodbClient.close()
    }
    //console.log(results)   
    return results
}

async function find_latest() {
    var results = {}
    try {
        await mongodbClient.connect();
        const database = mongodbClient.db('cn466');
        const sensor = database.collection('sensor')
        results = await sensor.find().sort({ "timestamp": -1 }).limit(1).toArray()
        // results = await sensor.findOne({})
        //แก้ให้เป็นหาอันล่าสุด

    } finally {
        await mongodbClient.close()
    }
    //console.log(results)   


    return results
}


app.post('/callback', line.middleware(line_cfg), (req, res) => {
    Promise
        .all(req.body.events.map(handleEvent))
        .then((result) => res.json(result))
        .catch((err) => {
            console.error(err);
            res.status(500).end();
        });

});

// event handler
async function handleEvent(event) {
    if (event.type !== 'message' || event.message.type !== 'text') {
        // ignore non-text-message event
        return Promise.resolve(null);
    }

    // create a echoing text message
    var echo = { type: 'text', text: event.message.text };
    switch (event.message.text) {
        case "on":
            mqttclient.publish('cn466/status', "on");
            echo.text = "เริ่มการส่งค่า sensor"
            return lineClient.replyMessage(event.replyToken, echo);

        case "off":
            mqttclient.publish('cn466/status', "off");
            echo.text = "ปิดการส่งค่า sensor"
            return lineClient.replyMessage(event.replyToken, echo);
            break
        case "data ปัจจุบัน":
            const data = await find_latest()
            console.log(`output = ${(JSON.stringify(data[0]))}`)

            var temp = parseFloat(data[0].temperature).toFixed(2)
            var humidity = parseFloat(data[0].humidity).toFixed(2)
            var pressure = parseFloat(data[0].pressure).toFixed(2)
            var timestamp = data[0].timestamp
            echo.text =
                `ข้อมูลที่บันทึกล่าสุด
อุณหภูมิ : ${temp} 
ความชื้น : ${humidity}
ความดันอาศ : ${pressure}
ณ เวลา : ${timestamp}`
            return lineClient.replyMessage(event.replyToken, echo);

        default:
            return lineClient.replyMessage(event.replyToken, echo);
    }

}

async function enable_ngrok() {
    const url = await ngrok.connect({
        proto: "http",
        addr: PORT,
        authtoken: process.env.NGROK_AUTH_TOKEN
    });
    return url;
}

app.get('/', (req, res) => {
    res.send("this is index wow")
});


app.listen(PORT, () => {
    console.log("It seems that BASE_URL is not set. Connecting to ngrok...")
    ngrok.connect({ addr: PORT, authtoken: process.env.NGROK_AUTH_TOKEN }).then(url => {
        console.log((`listening on ${url}/callback`));
        lineClient.setWebhookEndpointUrl(url + '/callback')
    }).catch(console.error)
});
console.log(`Running on http://${HOST}:${PORT}`);
