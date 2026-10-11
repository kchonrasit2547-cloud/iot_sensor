# Capability Spec: Live Node-RED Feature Matrix

**Spec ID:** `live-node-red-feature-matrix`  
**Version:** v5 OSS LTS  
**Status:** READY FOR REVIEW  
**Date:** 2026-07-22  
**Related:** #574 blind spot, 24-month GitHub bug class coverage

---

## 1. Problem

`node-red-node-test-helper` **does** boot a real Node-RED runtime
(`helper.init(require.resolve('node-red'))` + `helper.load`). Many suites still:

- stub handlers / call internal methods with fake responses, or
- deploy flows without asserting Modbus TCP outcomes, or
- skip `#test-debt-e2e` (~26 cases) — **restored as live TCP in `test/e2e/modbus-tcp-live-e2e-test.js` (2026-07-22)**; stub theatre dropped (see test-inventory).

Production regressions (#574 Queue full, #423 shared-client STOP) slip through
when only core/sinon or “load theatre” exists.

## 2. Goals

1. Document the three test layers (core / helper-unit / **live Modbus**).
2. Add `test/integrations/` live matrix: every palette node exercises a real
   flow against in-process `Modbus-Server` with ephemeral ports +
   `waitForModbusClientActive`.
3. Lock #574-shaped sequential multi-UnitId Flex-Getter drain as a **live**
   regression (not only stubbed queue-core).
4. Prefer asserting `msg.payload` / events over stubbing `onModbus*Done`.

## 3. Scope

### In-scope

| Area | Change |
|------|--------|
| `test/integrations/modbus-live-feature-matrix-test.js` | Live matrix |
| `test/integrations/flows/` | Flow fixtures |
| `docs/p4nr/` | This capability + plan + checklist update |
| npm script | `test:integrations` |

### Out-of-scope

- Hardware serial RTU (no USB in CI)
- Full reactivation of all 26 `#test-debt-e2e` skips in one PR (track separately) — **done for TCP paths**; stub theatre intentionally not revived.
- Publishing / registry issues

## 4. Functional Requirements

### FR-LIVE-01 — Runtime

Every integrations test MUST use `helper.init(require.resolve('node-red'))`,
`helper.startServer`, `helper.load`, and unload/stop.

### FR-LIVE-02 — Real TCP

Client MUST connect to `Modbus-Server` on an ephemeral port from `getPort` /
`withEphemeralPorts`. Tests MUST wait with `waitForModbusServerListening` and
`waitForModbusClientActive` before inject/`receive`.

### FR-LIVE-03 — Node matrix (minimum)

Live success path for:

1. Flex-Getter sequential (`parallelUnitIdsAllowed: false`) — multi UnitId / multi read (#574)
2. Flex-Write FC6 then Flex-Getter read-back
3. Modbus-Read (at least one payload)
4. Modbus-Getter (inject → payload)
5. Response-Filter on named IO (or register list) after a read path
6. Flex-Sequencer (≥1 sequence step payload)
7. Shared client: two Flex-Getters; deregister one; other still receives
8. Queue-Info reflects buffered queue while sequential client busy/active
9. Flex-Fc OR Flex-Connector: one reconnect/config or custom-FC smoke if stable

### FR-LIVE-04 — Assertions

Assert observable outputs (`helper` node input, node events, payload length /
values). MUST NOT call `done()` solely because `helper.load` succeeded.

### FR-LIVE-05 — Stability

CI-safe timeouts; unique node ids under parallel mocha; no fixed port 502.

## 5. Acceptance

1. `npm run test:integrations` green locally and in CI.
2. #574-shaped live test fails if re-arm is reverted.
3. Checklist documents live vs theatre distinction.
