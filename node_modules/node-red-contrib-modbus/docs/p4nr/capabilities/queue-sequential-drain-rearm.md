# Capability Spec: Sequential Queue Drain Re-arm (#574)

**Spec ID:** `queue-sequential-drain-rearm`  
**Version:** v5 OSS LTS (`node-red-contrib-modbus` 5.x)  
**Status:** READY FOR REVIEW  
**Author:** p4nr-spec-author (Team 1)  
**Date:** 2026-07-22  
**Related:** GitHub #574 (Queue full / empty payloads after 5.46.0 / 5.50.0)

---

## 1. Problem Statement

After upgrading from **5.45.2** to **5.46.0 / 5.50.0**, flows that use:

- `bufferCommands: true`
- `parallelUnitIdsAllowed: false` (sequential UnitId drain)
- Modbus-Flex-Getter (or Getter) with multiple queued reads (same or different UnitIds)

show: only one (or few) payloads, Flex-Getter stuck in **queueing**, then
`Error: Queue full for UnitId N (max 100)`.

### Root cause

Commit `362785b` (repo-quality / FR-QUEUE-02) dedupes `unitSendingAllowed` on
push:

```js
if (!node.unitSendingAllowed.includes(unitId)) {
  node.unitSendingAllowed.push(unitId)
}
```

Sequential dequeue does `unitSendingAllowed.shift()` then sends **one** command.
The existing drain loop is:

`command complete → activateSending → ACTIVATE → activated → QUEUE if not empty → SEND → dequeue`

After the first `shift()`, `unitSendingAllowed` is empty even when
`bufferCommandList.get(unitId)` still has work. The next dequeue rejects with an
invalid UnitId; remaining commands never leave the queue until `maxQueueDepth`
(default 100) → **Queue full**.

### Test blind spot

`test/core/modbus-queue-core-test.js` asserted only
“should not duplicate unitId entries” — never that **N>1** commands for the same
UnitId with `parallelUnitIdsAllowed: false` all complete via the
ACTIVATE→QUEUE drain. The Flex-Getter sequential test does not force the
client’s `parallelUnitIdsAllowed: false` path that users hit in #574.

---

## 2. Goals

1. Restore correct sequential drain for many queued commands per UnitId
   (5.45.2 behaviour) while keeping push-time dedupe (FR-QUEUE-02 intent).
2. Close the test blind spot with an explicit multi-command drain regression.
3. Patch release (**5.50.1**) — critical user-visible regression.

---

## 3. Scope

### In-scope

| Area | Change |
|------|--------|
| `src/modbus-client.js` | Re-arm `unitSendingAllowed` in `activateSending` when work remains |
| Spec clarification | FR-QUEUE-02 = at most one **pending drain slot** per UnitId, not “never re-arm after shift” |
| `test/core/` + `test/units/` | Drain / re-arm / #574-shaped regression |
| CHANGELOG | Bug fix entry |
| Optional | Spec-validation failure path must unlock sending (`activateSendingOnFailure`) |

### Out-of-scope

- Removing `maxQueueDepth` / FR-QUEUE-01
- Changing parallel UnitId mode (`parallelUnitIdsAllowed: true`)
- Private registry / `@openp4nr/modbus-serial` install issues

---

## 4. Functional Requirements

### FR-QSDR-01 — Re-arm after command complete

When `activateSending(msg)` runs and `bufferCommands` is true, if sequential
drain applies (`!parallelUnitIdsAllowed` **or** `clienttype === 'serial'`), and
`bufferCommandList.get(msg.queueUnitId)` still has length > 0, and that UnitId
is **not** already in `unitSendingAllowed`, the UnitId MUST be pushed again
before resolving.

### FR-QSDR-02 — Push-time dedupe retained

`pushToQueueByUnitId` MUST keep the `includes` guard so
`unitSendingAllowed` does not grow unboundedly while a UnitId is already
scheduled.

### FR-QSDR-03 — Existing FSM drain unchanged

`activateSendingOnSuccess` / `OnFailure` MUST continue to send `ACTIVATE`;
the `activated` handler MUST continue to send `QUEUE` when queues are not empty.
Re-arm alone MUST be sufficient for the next dequeue to pick the UnitId.

### FR-QSDR-04 — Validation unlock (related)

If address/quantity validation rejects a command that was already dequeued
(`sendingAllowed` already false), the failure path MUST call
`activateSendingOnFailure` (or equivalent unlock + ACTIVATE) so the queue is
not stranded. Primary #574 fix is FR-QSDR-01; this is a secondary stuck-queue
guard.

### FR-QSDR-05 — Tests

1. Core/client: N>1 pushes same UnitId, `parallelUnitIdsAllowed: false`,
   simulate dequeue + `activateSending` until empty — all N `callModbus` run.
2. `activateSending` re-adds UnitId when remaining depth > 0; does not duplicate
   when already present.
3. Dedup-on-push test remains valid for “already pending”.
4. Integration-shaped test: ≥2 Flex-Getter/client buffered reads with
   `parallelUnitIdsAllowed: false` complete without Queue full.

---

## 5. Non-Functional

- Backwards compatible message API and palette options.
- No new dependencies.
- Mocha + node-red-node-test-helper only.

---

## 6. Acceptance

1. User flow from #574 (split multi-read, sequential client) drains fully.
2. No `Queue full` under sustained inject when the device answers within timeout.
3. `npm run build` + targeted unit/core tests green.
4. CHANGELOG documents the 5.46.0 regression fix for 5.50.1.
