import mqttPattern from 'mqtt-pattern'

var registeredMetrics = {}

function addOrUpdate(fqm, m, v, pattern) {
  if (!(fqm in registeredMetrics)) {
    const metrics = new client.Gauge({
      name: m,
      help: `MQTT metric ${m}`,
      labelNames: ['energy_site_id', 'site_name', 'resource_type'],
    });
    register.registerMetric(metrics);
    registeredMetrics[fqm] = metrics;
  }
  registeredMetrics[fqm].labels( p.energy_site_id, p.site_name, p.resource_type ).set(Number(v));
}

function processMessage(pattern, topic, message) {

  let params = mqttPattern.exec(pattern.pattern, topic)
  if (!params) {
    return false
  }

  console.log(`Matched ${topic} with ${pattern.pattern}`)
  
  console.log(params)
  let msg = message.toString()
  console.log(msg)
  
  switch (pattern.format) {
    case 'val': {
      console.log(`val: ${Number(msg)}`)
    } break
    default: {
      // json
      console.log(`json: ${JSON.parse(msg)}`)
    }
  }

  return true
}

export { processMessage }; 