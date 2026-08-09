/**
 * Each fixture defines:
 *   pattern       - the pattern config object (mirrors config.yaml entries)
 *   topic         - the MQTT topic the message arrives on
 *   payload       - the raw MQTT payload string
 *   expected      - metrics that MUST exist: [{ name, value, labels }]
 *   absent        - metric names that MUST NOT be registered
 *   returns       - expected return value of processMessage (default: true)
 */
export const fixtures = [
  {
    description: 'JSON — flat numeric fields become metrics with topic label',
    pattern: {
      pattern: 'home/+device/json',
      format: 'json',
      labels: { location: 'home' },
    },
    topic: 'home/sensor1/json',
    payload: JSON.stringify({ temp: 22.5, humidity: 60 }),
    expected: [
      { name: 'test_temp',     value: 22.5, labels: { device: 'sensor1', location: 'home' } },
      { name: 'test_humidity', value: 60,   labels: { device: 'sensor1', location: 'home' } },
    ],
  },

  {
    description: 'JSON — label-fields promotes field to label, not metric',
    pattern: {
      pattern: 'home/+device/json',
      format: 'json',
      'label-fields': ['sensor_id'],
    },
    topic: 'home/sensor1/json',
    payload: JSON.stringify({ temp: 22.5, humidity: 60, sensor_id: 'abc' }),
    expected: [
      { name: 'test_temp',     value: 22.5, labels: { device: 'sensor1', sensor_id: 'abc' } },
      { name: 'test_humidity', value: 60,   labels: { device: 'sensor1', sensor_id: 'abc' } },
    ],
    absent: ['test_sensor_id'],
  },

  {
    description: 'JSON — recursive: Yes parses nested objects as prefixed metrics',
    pattern: {
      pattern: 'tele/+device/SENSOR',
      prefix: 'tm_',
      recursive: true,
    },
    topic: 'tele/device1/SENSOR',
    payload: JSON.stringify({ temp: 21.0, DS18B20: { Temperature: 21.0 } }),
    expected: [
      { name: 'test_tm_temp',                 value: 21.0, labels: { device: 'device1' } },
      { name: 'test_tm_ds18b20_temperature',  value: 21.0, labels: { device: 'device1' } },
    ],
  },

  {
    description: 'JSON — nested label-fields using → path separator',
    pattern: {
      pattern: 'tele/+device/SENSOR',
      prefix: 'tm_',
      recursive: true,
      'label-fields': ['telemetry→sender'],
    },
    topic: 'tele/device1/SENSOR',
    payload: JSON.stringify({ temp: 22.5, telemetry: { sender: 'device_01', rssi: -45 } }),
    expected: [
      { name: 'test_tm_temp',          value: 22.5, labels: { device: 'device1', telemetry_sender: 'device_01' } },
      { name: 'test_tm_telemetry_rssi', value: -45, labels: { device: 'device1', telemetry_sender: 'device_01' } },
    ],
  },

  {
    description: 'JSON — flat label-fields on a deep topic pattern with recursive payload',
    pattern: {
      pattern: 'msh/US/2/json/JJA/+device',
      prefix: 'mesh_',
      recursive: true,
      'label-fields': ['from', 'type'],
    },
    topic: 'msh/US/2/json/JJA/123456',
    payload: JSON.stringify({
      channel: 0,
      from: 2155854106,
      hop_start: 3,
      hops_away: 0,
      id: 422333797,
      payload: {
        air_util_tx: 0.204888895153999,
        battery_level: 88,
        channel_utilization: 1.06833338737488,
        uptime_seconds: 59543,
        voltage: 4.04199981689453,
      },
      rssi: -54,
      sender: '!c1e41c48',
      snr: 5.25,
      timestamp: 1785880244,
      to: 4294967295,
      type: 'telemetry',
    }),
    expected: [
      // 'from' and 'type' are label-fields — they appear as labels on every metric, not as metrics themselves
      { name: 'test_mesh_channel',                  value: 0,   labels: { device: '123456', from: '2155854106', type: 'telemetry' } },
      { name: 'test_mesh_rssi',                     value: -54, labels: { device: '123456', from: '2155854106', type: 'telemetry' } },
      { name: 'test_mesh_payload_battery_level',    value: 88,  labels: { device: '123456', from: '2155854106', type: 'telemetry' } },
    ],
    absent: ['test_mesh_from', 'test_mesh_type'],
  },

  {
    description: 'JSON — label-fields value passes through value-map',
    pattern: {
      pattern: 'home/+device/json',
      format: 'json',
      'label-fields': ['mode'],
      'value-map': { active: 1, standby: 0 },
    },
    topic: 'home/sensor1/json',
    payload: JSON.stringify({ temp: 22.5, mode: 'active' }),
    expected: [
      { name: 'test_temp', value: 22.5, labels: { device: 'sensor1', mode: '1' } },
    ],
    absent: ['test_mode'],
  },

  {
    description: 'JSON — value-map converts string field values to numbers',
    pattern: {
      pattern: 'home/+device/status',
      format: 'json',
      'value-map': { active: 1, inactive: 0 },
    },
    topic: 'home/sensor1/status',
    payload: JSON.stringify({ state: 'active', battery: 85 }),
    expected: [
      { name: 'test_state',   value: 1,  labels: { device: 'sensor1' } },
      { name: 'test_battery', value: 85, labels: { device: 'sensor1' } },
    ],
  },

  {
    description: 'val — numeric payload sets metric named after the last topic segment',
    pattern: {
      pattern: 'home/+device/temperature',
      format: 'val',
    },
    topic: 'home/sensor1/temperature',
    payload: '23.4',
    expected: [
      { name: 'test_temperature', value: 23.4, labels: { device: 'sensor1' } },
    ],
  },

  {
    description: 'val — value-map converts a known string payload to a number',
    pattern: {
      pattern: 'tele/+device/LWT',
      prefix: 'tms_',
      format: 'val',
      'value-default': 0,
      'value-map': { Online: 1, Offline: 0 },
    },
    topic: 'tele/device1/LWT',
    payload: 'Online',
    expected: [
      { name: 'test_tms_lwt', value: 1, labels: { device: 'device1' } },
    ],
  },

  {
    description: 'val — unknown payload falls back to value-default',
    pattern: {
      pattern: 'tele/+device/LWT',
      prefix: 'tms_',
      format: 'val',
      'value-default': 0,
      'value-map': { Online: 1 },
    },
    topic: 'tele/device1/LWT',
    payload: 'Unknown',
    expected: [
      { name: 'test_tms_lwt', value: 0, labels: { device: 'device1' } },
    ],
  },

  {
    description: 'Non-matching topic returns false and registers no metrics',
    pattern: {
      pattern: 'home/+device/json',
      format: 'json',
    },
    topic: 'other/sensor1/data',
    payload: JSON.stringify({ temp: 22.5 }),
    expected: [],
    returns: false,
  },
]
