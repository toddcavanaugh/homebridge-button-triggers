# Changelog

## 1.0.1
- Serialize and batch state persistence, skip redundant writes, and keep failed commands from changing live switch state.
- Drain pending commands on shutdown and preserve malformed state files while recovering with configured defaults.
- Remove cached accessories even when configuration is empty.
- Reject missing IDs, invalid event names, malformed URLs, and overflowing reset delays.
- Keep oversized request errors readable by HTTP clients.
- Add HTTP, HomeKit, concurrency, recovery, lifecycle, and compatibility tests.
- Refresh development dependencies and correct authenticated request examples.

## 1.0.0 - First public release
- Added public package metadata for npm / Homebridge UI / GitHub links.
- Declared support for Node.js 20, 22, and 24.
- Reframed documentation around a switch-first setup for new installs.
- Kept legacy `homebridge-button-platform` compatibility as best-effort guidance instead of the primary path.
- Changed `legacyRoutes` to be disabled by default for clean new installs.
- Improved release notes and GitHub repo readiness.
- Prevented the HTTP server from starting when no buttons or switches are configured.

## 0.1.0 - Initial draft
- Initial scaffold for `homebridge-button-triggers`.
- Virtual buttons with legacy route and event alias support.
- Virtual switches with state persistence and optional momentary mode.
- Config UI X schema and migration documentation.
