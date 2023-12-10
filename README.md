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
