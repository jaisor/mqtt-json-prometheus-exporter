FROM node:16-slim AS BUILD_IMAGE

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci --omit=dev

COPY src/ .

FROM node:16-slim AS build

RUN mkdir -p /config

ENV PORT=8080

WORKDIR /usr/src/app

COPY --from=BUILD_IMAGE /usr/src/app/index.js ./index.mjs
COPY --from=BUILD_IMAGE /usr/src/app/*.mjs ./
COPY --from=BUILD_IMAGE /usr/src/app/node_modules ./node_modules

ENV CONFIG_PATH="${CONFIG_PATH}"

ENTRYPOINT  [ "node", "index.mjs" ]