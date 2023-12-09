import dotenv from 'dotenv'
import fs from 'fs'
import { parse as parseYaml } from 'yaml'
import express from 'express'
import schedule from 'node-schedule'
import moment from 'moment'
import * as mqtt from 'mqtt'
import mqttPattern from 'mqtt-pattern'
import { initRegister, processMessage, register } from './metrics-helper.mjs'

var patterns = []

// Config
dotenv.config()

const configPath = process.env.CONFIG_PATH || '.config'
const configFile = fs.readFileSync(configPath + '/config.yaml', 'utf8')
const config = parseYaml(configFile)
//console.log(config)

// Prometheus client
initRegister(config.global?.prefix, config.global?.labels)

// MQTT client 
const mqttClient = mqtt.connect(config.mqtt?.url, config.mqtt?.options)

// Connect to the MQTT broker and subscribe to relevant topics
mqttClient.on('connect', function () {
  console.log(`Connected to MQTT broker at ${config.mqtt?.url}`)
  for(let p of config.patterns) {
    let topic = mqttPattern.clean(p.pattern)
    p['topic'] = topic
    patterns.push(p)
    mqttClient.subscribe(topic, (err) => {
      if (err) {
        console.error(`Error subscribing to '${topic}'`, err)
      } else {
        console.log(`Subscribed to '${topic}'`)
      }
    })
  }
})

mqttClient.on('message', (topic, message) => {
  for(let p of patterns) {
    if (processMessage(p, topic, message)) {
      return
    }
  }
  console.error(`Unexpected topic ${topic}`)
})

// House keeping
function handleExit(signal) {
  console.log(`Exiting due to signal ${signal}`)
  mqttClient.end(true)
  schedule.gracefulShutdown().then(() => process.exit(0))
}
process.on('SIGINT', handleExit)
process.on('SIGTERM', handleExit)

//

async function runTask(fireDate) {
  console.log(moment().format('lll') + ` (${fireDate}) : Running task`)
}

runTask(moment().format('lll'))
schedule.scheduleJob("*/1 * * * *", function(fireDate){
  runTask(fireDate)
})

// Express server
const server = express()

// Populate metrics
server.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', register.contentType)
    res.end(await register.metrics())
  } catch (ex) {
    console.error(ex)
    res.status(500).end(ex)
  }
})

const port = process.env.PORT || 8080
console.log(
  `Server listening to ${port}, metrics exposed on /metrics endpoint`,
)
server.listen(port)