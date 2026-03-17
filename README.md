# homebridge-button-triggers

Virtual Homebridge buttons and switches with a simple local HTTP interface.

`homebridge-button-triggers` lets local tools like Stream Deck, scripts, shortcuts, and webhooks control virtual accessories in Apple Home through Homebridge.

It supports two accessory types:

- **Switches** for normal visible on/off controls in Apple Home
- **Buttons** for stateless trigger events like single, double, and long press

For most new installs, start with a **switch**. It behaves the way people expect in Apple Home and avoids the weirdness of stateless button UX.

## Features

- Virtual **switches** backed by `Switch`
- Virtual **buttons** backed by `StatelessProgrammableSwitch`
- HTTP **GET** and **POST** trigger routes
- Optional token auth via:
  - `Authorization: Bearer <token>`
  - `?token=<token>`
- Stateful switch persistence across restart
- Optional momentary switch mode with auto-reset
- Config UI X schema support
- Compatibility helpers for `homebridge-button-platform`
  - legacy platform alias: `button-platform`
  - legacy event aliases (`click`, `double-click`, `hold`, etc.)
  - optional legacy `/button-:id` routes

## Install

```bash
npm install -g homebridge-button-triggers
```

Then add a platform entry in Homebridge.

## Choose the right accessory type

### Use a switch when
- you want a normal **on/off tile** in Apple Home
- you want state to persist
- you want clean routes like `/switches/stream-lights/on`

### Use a button when
- you want a **stateless automation trigger**
- you need **single / double / long press** events
- you are replacing a legacy button-based workflow

## Quick start: switch-first setup

This is the recommended setup for new installs.

```json
{
  "platform": "ButtonTriggers",
  "name": "Button Triggers",
  "host": "0.0.0.0",
  "port": 3001,
  "authToken": "replace-with-a-long-random-token",
  "legacyRoutes": false,
  "switches": [
    {
      "id": "stream-lights",
      "name": "Stream Lights",
      "mode": "stateful"
    }
  ]
}
```

### Test the health endpoint

```bash
curl 'http://127.0.0.1:3001/health'
```

### Turn the switch on

```bash
curl 'http://127.0.0.1:3001/switches/stream-lights/on?token=replace-with-a-long-random-token'
```

### Turn it off

```bash
curl 'http://127.0.0.1:3001/switches/stream-lights/off?token=replace-with-a-long-random-token'
```

### Toggle it

```bash
curl 'http://127.0.0.1:3001/switches/stream-lights/toggle?token=replace-with-a-long-random-token'
```

### Read current state

```bash
curl 'http://127.0.0.1:3001/switches/stream-lights'
```

> Tip: quote URLs that contain `?` or `&` so shells like zsh do not try to interpret them.

## Button example

Use buttons for trigger-style automations.

```json
{
  "platform": "ButtonTriggers",
  "name": "Button Triggers",
  "host": "0.0.0.0",
  "port": 3001,
  "authToken": "replace-with-a-long-random-token",
  "buttons": [
    {
      "id": "stream-scene",
      "name": "Stream Scene"
    }
  ]
}
```

### Trigger a button with a GET request

```bash
curl 'http://127.0.0.1:3001/buttons/stream-scene?event=single&token=replace-with-a-long-random-token'
```

### Trigger a button with a POST request

```bash
curl -X POST 'http://127.0.0.1:3001/buttons/stream-scene?token=replace-with-a-long-random-token' \
  -H 'Content-Type: application/json' \
  -d '{"event":"double"}'
```

## HTTP API

### Health

```bash
curl 'http://127.0.0.1:3001/health'
```

### Buttons

```bash
curl 'http://127.0.0.1:3001/buttons/stream-scene?event=single'
curl 'http://127.0.0.1:3001/buttons/stream-scene?event=double'
curl 'http://127.0.0.1:3001/buttons/stream-scene?event=long'
```

```bash
curl -X POST 'http://127.0.0.1:3001/buttons/stream-scene' \
  -H 'Content-Type: application/json' \
  -d '{"event":"single"}'
```

### Switches

```bash
curl 'http://127.0.0.1:3001/switches/stream-lights/on'
curl 'http://127.0.0.1:3001/switches/stream-lights/off'
curl 'http://127.0.0.1:3001/switches/stream-lights/toggle'
curl 'http://127.0.0.1:3001/switches/stream-lights'
```

```bash
curl -X POST 'http://127.0.0.1:3001/switches/stream-lights/set' \
  -H 'Content-Type: application/json' \
  -d '{"state":true}'
```

### Authenticated requests

Bearer token:

```bash
curl 'http://127.0.0.1:3001/switches/stream-lights/on' \
  -H 'Authorization: Bearer replace-with-a-long-random-token'
```

Query token:

```bash
curl 'http://127.0.0.1:3001/switches/stream-lights/on?token=replace-with-a-long-random-token'
```

## Host binding guidance

- Use `127.0.0.1` if only the Homebridge machine itself should access the HTTP server.
- Use `0.0.0.0` if other devices on your LAN need access, such as Stream Deck, another Mac, or a phone.
- If you bind beyond localhost, set `authToken`.

## Apple Home behavior notes

- **Switches** appear as normal on/off accessories in Apple Home.
- **Buttons** are exposed as `Stateless Programmable Switch` accessories.
- Stateless buttons can feel less obvious in Apple Home because they are meant for automations and event triggers, not persistent on/off state.

## ID rules

- `id` is the stable identity field.
- `name` is the Home display label.
- Routes use a normalized form of the ID.
- Changing `name` is usually safe.
- Changing `id` can create a new accessory identity.

## Migration from homebridge-button-platform

Migration support is included, but it is now treated as **best effort**, not the primary setup path.

### Compatibility helpers included
- legacy platform alias: `button-platform`
- shorthand button arrays: `buttons: ["id-one", "id-two"]`
- legacy button event aliases
- optional legacy route shape: `/button-:id?event=click`
- legacy-compatible button UUID seed generation

### Example migration config

```json
{
  "platform": "button-platform",
  "name": "Button Platform",
  "port": 3001,
  "legacyRoutes": true,
  "buttons": [
    "stream-lights-on",
    "stream-lights-off"
  ]
}
```

### Important note

This plugin can make migration safer, but it cannot guarantee that Apple Home will preserve every accessory, scene, or automation without repair. Fresh installs should prefer the modern `ButtonTriggers` config directly.

## Config UI X notes

`config.schema.json` is included for Config UI X.

The schema targets the modern `ButtonTriggers` config shape. Runtime compatibility for legacy installs remains available, but new setups should use object-based button and switch definitions.

## Development

```bash
npm install
npm run lint
npm run build
npm test
```

## Release status

`1.0.0` is the first intended public release:

- switch-first examples for new installs
- button support for automation triggers
- optional auth token support
- switch persistence and momentary mode
- compatibility helpers for `homebridge-button-platform`
