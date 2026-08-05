import { describe, it, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse as parseYaml } from 'yaml'
import { initRegister, processMessage, register } from '../src/metrics-helper.mjs'
import { fixtures } from './fixtures.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))

/**
 * Returns the sample from a registered metric whose labels are a superset of
 * matchLabels, or undefined if no such sample exists.
 */
async function findSample(metricName, matchLabels) {
  const all = await register.getMetricsAsJSON()
  const metric = all.find(m => m.name === metricName)
  if (!metric) return undefined
  return metric.values.find(sample =>
    Object.entries(matchLabels).every(([k, v]) => String(sample.labels[k]) === String(v))
  )
}

describe('processMessage', () => {
  beforeEach(() => {
    register.clear()
    initRegister('test_', {})
  })

  for (const fixture of fixtures) {
    it(fixture.description, async () => {
      const result = processMessage(fixture.pattern, fixture.topic, fixture.payload)

      const expectedReturn = fixture.returns ?? true
      assert.equal(result, expectedReturn,
        `processMessage should return ${expectedReturn} for topic '${fixture.topic}'`)

      for (const { name, value, labels } of fixture.expected ?? []) {
        const sample = await findSample(name, labels)
        assert.ok(sample,
          `Expected metric '${name}' with labels ${JSON.stringify(labels)} to be registered`)
        assert.equal(sample.value, value,
          `Expected '${name}' to equal ${value}, got ${sample?.value}`)
      }

      for (const metricName of fixture.absent ?? []) {
        const all = await register.getMetricsAsJSON()
        const metric = all.find(m => m.name === metricName)
        assert.equal(metric, undefined,
          `Expected metric '${metricName}' to NOT be registered`)
      }
    })
  }
})

describe('file-based', () => {
  let config

  // Dispatches a message through all configured patterns, mirroring index.js behaviour
  function dispatch(topic, payload) {
    for (const pattern of config.patterns) {
      if (processMessage(pattern, topic, payload)) return true
    }
    return false
  }

  before(() => {
    config = parseYaml(readFileSync(join(__dirname, 'data/config.yaml'), 'utf8'))
  })

  beforeEach(() => {
    register.clear()
    initRegister(config.global?.prefix ?? '', config.global?.labels ?? {})
  })

  it('mesh_telemetry.json — numeric fields become metrics, label-fields become labels', async () => {
    const { topic, payload } = JSON.parse(
      readFileSync(join(__dirname, 'data/payloads/mesh_telemetry.json'), 'utf8')
    )
    assert.ok(dispatch(topic, JSON.stringify(payload)))

    // global prefix is blank; pattern prefix is mesh_
    const channel = await findSample('mesh_channel', { device: '123456', from: '123456789', type: 'telemetry' })
    assert.ok(channel, 'mesh_channel should be registered')
    assert.equal(channel.value, 0)

    const battery = await findSample('mesh_payload_battery_level', { device: '123456', from: '123456789', type: 'telemetry' })
    assert.ok(battery, 'mesh_payload_battery_level should be registered')
    assert.equal(battery.value, 88)

    // label-fields 'from' and 'type' must not appear as standalone metrics
    const all = await register.getMetricsAsJSON()
    assert.equal(all.find(m => m.name === 'mesh_from'), undefined, 'mesh_from must not be a metric')
    assert.equal(all.find(m => m.name === 'mesh_type'), undefined, 'mesh_type must not be a metric')
  })

  it('home_sensor.json — flat JSON fields become metrics with location label', async () => {
    const { topic, payload } = JSON.parse(
      readFileSync(join(__dirname, 'data/payloads/home_sensor.json'), 'utf8')
    )
    assert.ok(dispatch(topic, JSON.stringify(payload)))

    const temp = await findSample('temp', { device: 'thermostat', location: 'home' })
    assert.ok(temp, 'temp should be registered')
    assert.equal(temp.value, 21.5)

    const humidity = await findSample('humidity', { device: 'thermostat', location: 'home' })
    assert.ok(humidity, 'humidity should be registered')
    assert.equal(humidity.value, 55)
  })
})
