# mqtt-json-prometheus-exporter
Subscribes to MQTT topics and parsing JSON formatted messages, exporting them to Prometheus

# Build & run

## Local npm

Ensure the script has access to CONFIG_PATH environment variable pointing to the the folder containing `topics.yaml`. Example `.env` file to accomplish this:

```
CONFIG_PATH=.config
```

Install and run

```
npm install
npm start
```

## Docker container

```
docker build -t mqtt-json-prometheus-exporter:latest .
```

```
docker run -dit --restart unless-stopped --name mqtt-json-prometheus-exporter \
  -v .config:/config \
  -e CONFIG_PATH=/config -p 9005:8080 \
  mqtt-json-prometheus-exporter:latest
```
