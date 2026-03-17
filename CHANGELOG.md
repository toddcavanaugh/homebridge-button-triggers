# Changelog

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
