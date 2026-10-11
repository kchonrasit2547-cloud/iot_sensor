# Plan: Live Node-RED Feature Matrix

**Spec:** `live-node-red-feature-matrix`  
**Date:** 2026-07-22

## Steps

1. Add `test/integrations/flows/modbus-live-feature-matrix-flows.js`.
2. Add `test/integrations/modbus-live-feature-matrix-test.js` (FR-LIVE-03).
3. Add `npm run test:integrations` in `package.json`.
4. Update `docs/p4nr/test-review-checklist.md` + `docs/p4nr/README.md`.
5. Run `npm run test:integrations` then `npm run test:ci` smoke.

## Patterns

Copy readiness waits from `test/units/modbus-flex-write-coverage-test.js`:
`getPort`, `waitForModbusServerListening`, `waitForModbusClientActive`,
CI-scaled timeouts, unique id suffixes if needed.
