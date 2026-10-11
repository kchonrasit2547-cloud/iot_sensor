# Plan: Sequential Queue Drain Re-arm (#574)

**Spec:** `queue-sequential-drain-rearm`  
**Date:** 2026-07-22  
**Target:** patch `5.50.1`

## Steps (TDD)

1. **Failing tests first**
   - `test/units/modbus-client-test.js` (or queue-core): push 3 cmds same
     UnitId with `parallelUnitIdsAllowed: false`; after each mocked command
     completion call `activateSending`; assert all 3 run and queues empty.
   - Assert `activateSending` pushes UnitId when depth remains and skips if
     already in `unitSendingAllowed`.
   - Keep push-dedupe test; add comment that it covers **pending** slot only.
   - Optional Flex-Getter / client flow with `parallelUnitIdsAllowed: false`
     and 2+ receives — all done events (or no Queue full).

2. **Implement FR-QSDR-01** in `src/modbus-client.js` → `activateSending`:
   re-arm UnitId when sequential mode + remaining queue depth > 0.

3. **FR-QSDR-04** in `src/core/modbus-client-core.js`: on
   `validateAddressAndQuantity` failure after a dequeued send, use
   `activateSendingOnFailure` instead of bare `cberr` return where the command
   already locked the unit (read/write FC dispatch paths).

4. `npm run build`.

5. CHANGELOG under Unreleased / 5.50.1.

6. Comment on GitHub #574 after verify.

## Out of scope this PR

- Publishing registry/tarball dependency fix (separate).
- Raising default `maxQueueDepth`.
