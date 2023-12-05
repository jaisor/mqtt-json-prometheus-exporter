import dotenv from 'dotenv'
import fs from 'fs';
import express from 'express';
import * as client from 'prom-client';
import schedule from 'node-schedule';
import moment from 'moment';
import * as mqtt from 'mqtt'
//import { poll } from './poll-metrics.mjs'

dotenv.config();
const server = express();
const register = new client.Registry()

register.setDefaultLabels({
  app: 'mqtt-json-prometheus-exporter'
})
client.collectDefaultMetrics({ register })

//

const mqttClient = mqtt.connect('mqtt://localhost:1883')

// Connect to the MQTT broker
mqttClient.on('connect', function () {
  console.log('Connected to MQTT broker')
})

//

process.on('SIGINT', function () {
	schedule.gracefulShutdown()
		.then(() => process.exit(0))
});

//

var registeredMetrics = {};

function runTask(fireDate) {
  console.log(moment().format('lll') + ` (${fireDate}) : Running task`)
}

runTask(moment().format('lll'));
schedule.scheduleJob("*/1 * * * *", function(fireDate){
  runTask(fireDate);
});

// Populate metrics
server.get('/metrics', async (req, res) => {
	try {
		res.set('Content-Type', register.contentType);
		res.end(await register.metrics());
	} catch (ex) {
		console.error(ex);
		res.status(500).end(ex);
	}
});

const port = process.env.PORT || 8080;
console.log(
	`Server listening to ${port}, metrics exposed on /metrics endpoint`,
);
server.listen(port);