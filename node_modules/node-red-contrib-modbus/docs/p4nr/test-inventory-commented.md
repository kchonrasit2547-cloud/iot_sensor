# Test inventory — commented / deferred blocks (mj era)

Triage of formerly commented `it()` blocks from the branch-coverage push (author `mj`).

| Decision | Count | Action |
|----------|-------|--------|
| DELETE | 6 | Removed — duplicate or wrong node/fixture |
| **RESTORED (TCP E2E)** | **12** | `test/e2e/modbus-tcp-live-e2e-test.js` — real helper + Modbus-Server |
| DROP (stub theatre) | ~10 | Never proved Modbus I/O; covered by live matrix / units |

## DELETE (removed, covered elsewhere)

| File | Former test | Reason |
|------|-------------|--------|
| `test/core/modbus-client-core-test.js` | activateSendingOnSuccess client ID 0 (commented) | Active test exists in same file |
| `test/units/modbus-client-test.js` | 4× legacy read/active flows (commented describe) | Superseded by current client/FSM tests |
| `test/units/modbus-response-filter-test.js` | inactive if message not allowed | Wrong node type (client vs filter) |

## RESTORED — Live TCP E2E (2026-07-22)

Maryam-era skips (`#test-debt-e2e`) were empty `it.skip` placeholders after bodies were deleted.
They are restored in **`test/e2e/modbus-tcp-live-e2e-test.js`** with:

- `helper.init(require.resolve('node-red'))` + `helper.load`
- ephemeral ports (`withEphemeralPorts`)
- `waitForModbusServerListening` + `waitForModbusClientActive`
- assert on `msg.payload` / node done events (not status theatre)

| Area | Restored titles |
|------|-----------------|
| Modbus-Read | empty topic, own topic, IO, IO-objects as payload |
| Modbus-Getter | inject payload, inject+IO path, `modbusGetterNodeDone` |
| Modbus-Flex-Write | HTTP JSON string, array coils, `"true"` / `"false"` strings |
| Modbus-Write | string `"true"` coil write done |

**Serial** remains out of CI (no USB). TCP proves the Modbus request/response path; serial is the same stack with different connection options.

## DROP — stub theatre (do not re-skip as pending mocha)

| Former title | Why dropped |
|--------------|-------------|
| getter emit readModbus | Never asserted `readModbus`; wrong node naming |
| getter not ready / not queueing | Forced `setNodeStatusTo` only |
| flex-sequencer ready to send | Status theatre |
| flex-sequencer invalid / not ready | Jest-style `helper.log().calledWith` (invalid API) |
| sequencer e2e error WIP | Incomplete Jest stub |
| checkQueueStates queue-info | Never ran as active test |
| server init on 127.0.0.2 | OS-dependent `EADDRNOTAVAIL` |
| client wrong TCP | `setTimeout(done)` masked failure |
| queue-info old reset / polling×16 | Brittle; superseded by live matrix Queue-Info |

See also: `docs/p4nr/capabilities/live-node-red-feature-matrix.md`, `npm run test:integrations`.
