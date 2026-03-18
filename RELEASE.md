# Release Instructions

## Repo readiness checklist
1. Confirm the final GitHub repo URL:
   - expected: `https://github.com/toddcavanaugh/homebridge-button-triggers`
2. Ensure GitHub Issues are enabled.
3. Ensure the npm package name is still available or publish under the planned final name.
4. Verify `author`, `homepage`, `repository`, and `bugs` fields still match the final repo.
5. Add screenshots to the GitHub repo before public launch if you want the README to feel more complete.

## Pre-release checklist
1. Review `README.md` and `CHANGELOG.md`.
2. Run:
   ```bash
   npm install
   npm run lint
   npm run build
   npm test
   npm pack --dry-run
   ```
3. Verify Node 20 / 22 / 24 in CI.
4. Re-check migration notes if identity or route logic changed.
5. Confirm Homebridge UI still shows the plugin metadata as expected after publish.

## Publish to npm
```bash
npm publish
```

If this is the first publish from a scoped package, use `--access public`.

Note: local terminal publishes should not force npm provenance. If we want provenance later, publish from a supported CI workflow instead of a local shell.

## Create the GitHub release
For every published version:
1. Create a Git tag matching the package version.
2. Push the tag.
3. Create a GitHub release with matching notes.

## Suggested 1.0.0 release notes
- First public release of `homebridge-button-triggers`
- Switch-first setup for normal Apple Home controls
- Stateless button support for trigger-style automations
- Optional auth token support for local HTTP routes
- Switch persistence plus momentary switch mode
- Best-effort compatibility helpers for `homebridge-button-platform`
