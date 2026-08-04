# mqtt-json-prometheus-exporter
Subscribes to MQTT topics, parsing JSON formatted (and simple value) messages, exporting them to Prometheus metrics

## Motivation
Many IoT devices use [MQTT](https://mqtt.org/) topics and messages to expose data. Often these messages are JSON formatted collection of metrics. 
A middleware component is needed to parse these messages and export them to [Prometheus](https://prometheus.io/docs/instrumenting/exporters/).
This is a lightweight Prometheus exporter service capable of subscribing to various MQTT topics, configured via patterns, and parsing
JSON formatted messages.

## Alternatives
* https://github.com/tg44/mqtt-prometheus-message-exporter - I used it at first, but encountered bugs with non-JSON messages crashing the service
* https://github.com/hikhvar/mqtt2prometheus - This is one of the officially linked solutions from Prometheus, but the configuration looked a lot more elaborate than what I needed 

## Configuration and usage

Create a config.yaml file in a dedicated folder for mounting in the docker container. Here is an example configuration:

`config.yaml`
```yaml
mqtt:
  url: mqtt://server.lan:1883
  options:
    # full list of options at https://www.npmjs.com/package/mqtt#mqttclientstreambuilder-options
global:
  prefix: mqtt_exporter_ # prefix prepended to all exported metrics, in addition to the pattern prefix if specified
  labels: # these labels are added to all exported metrics
    app: mqtt-json-prometheus-exporter
patterns:
  - pattern: home/+device/json # the value from '+device' part of the topic will be added to a label called 'device'
    format: json # 'json' is the default, other option is 'val' for a scalar value
    labels:  # additional labels to associate the metric with
      location: home
    label-fields: [sensor_id] # payload fields whose values become labels instead of metrics
  - pattern: tele/+device/SENSOR
    prefix: tm_ # default prefix is blank
    recursive: Yes # also parse entries that are json objects themselves
  - pattern: tele/+device/STATE
    prefix: tms_
    recursive: Yes
  - pattern: tele/+device/LWT
    prefix: tms_
    format: val
    value-default: 0 # 0 is default if unspecified
    value-map: # values mapped to numbers
      Online: 1
```

### label-fields

The `label-fields` option promotes payload fields to Prometheus labels rather than exporting them as metrics. This is useful when a field identifies the source of the data (e.g. a sensor ID or room name) and should instead be used to differentiate metric series.

**Flat fields** — specify the field name directly:

```yaml
- pattern: home/+device/json
  label-fields: [sensor_id, room]
```

Given the payload `{"temp": 22.5, "humidity": 60, "sensor_id": "abc", "room": "kitchen"}`, this produces:

```
mqtt_exporter_temp{device="...", sensor_id="abc", room="kitchen"} 22.5
mqtt_exporter_humidity{device="...", sensor_id="abc", room="kitchen"} 60
```

**Nested fields** — use `→` to traverse into a nested object. The label name is the full path joined with `_`:

```yaml
- pattern: tele/+device/SENSOR
  recursive: Yes
  label-fields:
    - telemetry→sender
```

Given the payload `{"temp": 22.5, "telemetry": {"sender": "device_01", "rssi": -45}}`, this produces:

```
tm_temp{device="...", telemetry_sender="device_01"} 22.5
tm_telemetry_rssi{device="...", telemetry_sender="device_01"} -45
```

Flat `label-fields` entries propagate into nested objects when `recursive: Yes` is set, so the label is attached to all metrics at every level. Nested path entries (using `→`) only extract from the specified path and do not otherwise affect sibling fields.

Start the docker container, mounting the configuration folder as a volume and selecting a favorable service port
```shell
docker run -dit --restart unless-stopped --name mqtt-json-prometheus-exporter \
  -v /etc/mjpe:/config -p 9001:8080 \
  jaisor/mqtt-json-prometheus-exporter:latest
```

Optionally a different configuration location and log level can be specified using environment variables
```
  -e CONFIG_PATH=/config \
  -e LOG_LEVEL=info \
```

After successful start the service will begin listening to HTTP GET `/metrics` with Prometheus compatible response

### Configure Prometheus 

Add the mqtt-json-prometheus-exporter service to Prometheus `config.yml` file
```yaml
  # MQTT JSON exporter
  - job_name: 'mqtt_json'
    scrape_interval: 30s
    static_configs:
    - targets: ['server.lan:9001']
```

## Build & run from source

### Local npm

Ensure the script has access to CONFIG_PATH environment variable pointing to the the folder containing `config.yaml`. Example `.env` file to accomplish this:

```
CONFIG_PATH=.config
```

Install and run

```shell
npm install
npm start
```

### Docker container

```shell
docker build -t mqtt-json-prometheus-exporter:local .
```

```shell
docker run -dit --restart unless-stopped --name mqtt-json-prometheus-exporter \
  -v .config:/config -p 9005:8080 \
  -e CONFIG_PATH=/config \
  -e LOG_LEVEL=info \
  mqtt-json-prometheus-exporter:local
```
