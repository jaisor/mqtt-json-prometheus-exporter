import mqttPattern from 'mqtt-pattern'
import * as promClient from 'prom-client'
import logger from 'winston'

// Prometheus client
const register = new promClient.Registry()
var globalPrefix = ''

const isNumeric = (num) => (typeof(num) === 'number' || typeof(num) === "string" && num.trim() !== '') && !isNaN(num)
const isObject = (value) => Object.prototype.toString.call(value) === '[object Object]'

function setMetric(m, v, labels) {
  if (!promClient.validateMetricName(m)) {
    logger.warn(`Invalid metric name: ${m}`)
    return
  }
  let metric = register.getSingleMetric(m)
  if (!metric) {
    metric = new promClient.Gauge({
      name: m,
      help: `MQTT metric ${m}`,
      labelNames: isObject(labels) ? Object.keys(labels) : [],
    })
    logger.info(`Registering '${m}'=${v} - ${JSON.stringify(labels)}`)
    register.registerMetric(metric)
  }
  metric.labels( labels || {} ).set(Number(v))
}

function processJsonObject(obj, prefix, params, recursive) {
  for (const [name, value] of Object.entries(obj)) {
    if (isNumeric(value)) {
      setMetric(globalPrefix + (prefix || '') + name.toLowerCase(), value, params)
    } else if (isObject(value) && recursive) {
      processJsonObject(value, prefix + name.toLowerCase() + '_', params, recursive)
    } else {
      // TODO: Allow config to specify logging these as warn
      logger.debug(`Unsupported value '${value}' for metric name '${name}'`)
    }
  }
}

function processMessage(pattern, topic, message) {

  let params = mqttPattern.exec(pattern.pattern, topic)
  if (!params) {
    return false
  }

  logger.debug(`Matched ${topic} to ${pattern.pattern} with ${JSON.stringify(params)}`)
  let msg = message.toString()
  
  //logger.debug(params)
  //logger.debug(msg)
  
  switch (pattern.format) {
    case 'val': {
      let value = 0
      if (isNumeric(msg)) {
        value = Number(msg)
      } else {
        value = pattern['value-default'] || 0
        if (isObject(pattern['value-map']) && msg in pattern['value-map']) {
          value = pattern['value-map'][msg]
        }
      }
      setMetric(globalPrefix + (pattern.prefix || '') + topic.split('/').pop().toLowerCase(), value, params)
    } break
    default: {
      // json
      try {
        processJsonObject(JSON.parse(msg), pattern.prefix, params, pattern.recursive)
      } catch (e) {
        return logger.error(e)
      }
    }
  }

  return true
}

function initRegister(prefix = '', labels = {}) {
  globalPrefix = prefix
  register.setDefaultLabels(labels)
  promClient.collectDefaultMetrics({ 
    register, 
    prefix: prefix,
    labels: labels
  })
}

export { initRegister, processMessage, register } 