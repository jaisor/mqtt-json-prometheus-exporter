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
  const newLabelNames = isObject(labels) ? Object.keys(labels) : []
  let metric = register.getSingleMetric(m)
  if (metric) {
    const unknownKeys = newLabelNames.filter(k => !metric.labelNames.includes(k))
    if (unknownKeys.length > 0) {
      // Label set grew (e.g. a label-fields key missing from the first message); re-register
      const mergedNames = [...new Set([...metric.labelNames, ...newLabelNames])]
      register.removeSingleMetric(m)
      metric = new promClient.Gauge({
        name: m,
        help: `MQTT metric ${m}`,
        labelNames: mergedNames,
        registers: [register],
      })
      logger.warn(`Re-registering '${m}' with expanded labels: ${JSON.stringify(mergedNames)}`)
    }
  } else {
    // registers: [register] avoids auto-registration in the global prom-client registry
    metric = new promClient.Gauge({
      name: m,
      help: `MQTT metric ${m}`,
      labelNames: newLabelNames,
      registers: [register],
    })
    logger.info(`Registering '${m}'=${v} - ${JSON.stringify(labels)}`)
  }
  metric.labels( labels || {} ).set(Number(v))
}

function extractLabelFromPath(obj, pathParts) {
  let current = obj
  for (const part of pathParts) {
    if (!isObject(current) || !(part in current)) return undefined
    current = current[part]
  }
  return isObject(current) ? undefined : current
}

// labelPaths: array of path-part arrays, e.g. [["sensor_id"], ["telemetry", "sender"]]
// Use → as the separator in config, e.g. label-fields: [telemetry→sender]
function processJsonObject(obj, prefix, params, recursive, valueMap = {}, labelPaths = []) {
  // Extract all label values by traversing each path from this object
  const extractedLabels = {}
  for (const pathParts of labelPaths) {
    const value = extractLabelFromPath(obj, pathParts)
    if (value !== undefined) {
      const strValue = String(value)
      const mappedValue = isObject(valueMap) && strValue in valueMap ? valueMap[strValue] : strValue
      extractedLabels[pathParts.join('_')] = String(mappedValue)
    }
  }
  const mergedParams = { ...params, ...extractedLabels }

  // Single-segment paths: skip these fields entirely (they are labels, not metrics)
  const skipFields = new Set(labelPaths.filter(p => p.length === 1).map(p => p[0]))

  // Multi-segment paths: map the first segment to the remaining sub-paths
  const subPathMap = {}
  for (const pathParts of labelPaths) {
    if (pathParts.length > 1) {
      const [head, ...tail] = pathParts
      if (!subPathMap[head]) subPathMap[head] = []
      subPathMap[head].push(tail)
    }
  }

  for (const [name, value] of Object.entries(obj)) {
    if (skipFields.has(name)) {
      continue // used as a label, not a metric
    } else if (isNumeric(value)) {
      setMetric(globalPrefix + (prefix || '') + name.toLowerCase(), value, mergedParams)
    } else if (isObject(value)) {
      // Combine sub-paths for this field with flat label paths (which propagate to all levels)
      const nestedPaths = [
        ...(subPathMap[name] || []),
        ...labelPaths.filter(p => p.length === 1),
      ]
      if (recursive) {
        processJsonObject(value, prefix + name.toLowerCase() + '_', mergedParams, recursive, valueMap, nestedPaths)
      } else if ((subPathMap[name] || []).length > 0) {
        // intermediate label path node; label already extracted above — silently skip
      } else if (isObject(valueMap) && value in valueMap) {
        setMetric(globalPrefix + (prefix || '') + name.toLowerCase(), valueMap[value], mergedParams)
      } else {
        logger.debug(`Unsupported value '${value}' for metric name '${name}'`)
      }
    } else if (isObject(valueMap) && value in valueMap) {
      setMetric(globalPrefix + (prefix || '') + name.toLowerCase(), valueMap[value], mergedParams)
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
  
  logger.debug(JSON.stringify(params))
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
      setMetric(globalPrefix + (pattern.prefix || '') + topic.split('/').pop().toLowerCase(), value, { ...params, ...(pattern.labels || {})})
    } break
    default: {
      // json
      try {
        processJsonObject(JSON.parse(msg), pattern.prefix, { ...params, ...(pattern.labels || {})}, pattern.recursive, pattern['value-map'] || {}, (pattern['label-fields'] || []).map(f => f.split('→')))
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
