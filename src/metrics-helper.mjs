import mqttPattern from 'mqtt-pattern'
import * as promClient from 'prom-client'

var registeredMetrics = {}

// Prometheus client
const register = new promClient.Registry()

function initRegister(prefix = '', labels = {}) {
  register.setDefaultLabels(labels)
  promClient.collectDefaultMetrics({ 
    register, 
    prefix: prefix,
    labels: labels
  })
}

const isNumeric = (num) => (typeof(num) === 'number' || typeof(num) === "string" && num.trim() !== '') && !isNaN(num);

function addOrUpdate(fqm, m, v, labels) {
  if (!(fqm in registeredMetrics)) {
    const metrics = new promClient.Gauge({
      name: m,
      help: `MQTT metric ${m}`,
      labelNames: labels.keys || [],
    });
    register.registerMetric(metrics);
    registeredMetrics[fqm] = metrics;
  }
  registeredMetrics[fqm].labels( labels ).set(Number(v));
}

function processMessage(pattern, topic, message) {

  let params = mqttPattern.exec(pattern.pattern, topic)
  if (!params) {
    return false
  }

  console.log(`Matched ${topic} with ${pattern.pattern}`)
  let msg = message.toString()
  
  //console.log(params)
  //console.log(msg)
  
  switch (pattern.format) {
    case 'val': {
      console.log(`val: ${Number(msg)}`)
    } break
    default: {
      // json
      try {
        let obj = JSON.parse(msg)
        for (const [name, value] of Object.entries(obj)) {
          if (isNumeric(value)) {
            addOrUpdate(topic + name, pattern.prefix + name, value, params)
            //console.log(`${name}: ${Number(value)}`)
          }
        }
        //console.log(`json: ${JSON.stringify(obj)}`)
      } catch (e) {
        return console.error(e)
      }
    }
  }

  return true
}

export { initRegister, processMessage, register }; 