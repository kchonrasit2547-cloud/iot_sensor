# Implementation Plan: Repo Quality & FSM Hardening

**Plan ID:** `repo-quality-and-fsm-hardening`
**Capability Spec:** `docs/p4nr/capabilities/repo-quality-and-fsm-hardening.md`
**Target:** v5 OSS LTS (`node-red-contrib-modbus` 5.x)
**Status:** AMENDED — reconnect semantics aligned with capability §5.1.6 (2026-06-13)
**Author:** p4nr-spec-author (Team 1)
**Date:** 2026-06-13
**Amendment:** 2026-06-13 — Mindest-Minor-Release 5.46.0 (FR-REL-01, Task 4.8)

> **GATE 1:** Team 3 (p4nr-developer) MUST NOT begin until an APPROVE file
> exists at `docs/p4nr/reviews/repo-quality-and-fsm-hardening-APPROVE.md`.

---

## Overview

Four sequential phases, each with a mandatory test gate before the next begins.
Every task follows TDD order: **failing test first → implementation →
`npm run build` → confirm green**.

```
Phase 1: Issue Triage & Baseline
Phase 2: FSM Hardening
Phase 3: Modbus-Spec Compliance & Security
Phase 4: Code Quality Refactor
```

Dependencies flow strictly downward:  
Phase 2 requires Phase 1 green.  
Phase 3 requires Phase 2 green.  
Phase 4 requires Phase 3 green.

---

## Phase 1 — Issue Triage & Baseline Stabilisation

**Goal:** Establish a clean, reproducible baseline.  No logic changes.

### Definition of Done (Phase 1)

- `npm test` exits 0 on Node.js ≥ 18.5
- `npm run lint` exits 0
- All existing `/* istanbul ignore next */` markers inventoried in a comment
  table inside `test/core/modbus-client-core-test.js` (code comment, not
  runtime test)
- GitHub issues confirmed against live tracker (manual step by Team 3)

### Task 1.1 — Verify baseline test suite

```
Files touched: none (read-only)
Command:       npm test
Expected:      all tests pass, 0 failures
```

If any test fails before any changes, document in a code comment at the top of
`test/core/modbus-client-core-test.js` and open a separate issue.

### Task 1.2 — Inventory `/* istanbul ignore next */` markers

```
Files to scan: src/**/*.js
Tool:          grep -rn 'istanbul ignore next' src/
Expected:      ~27 matches across 12 files
```

Team 3: record exact file + line in a code comment block at the top of
`test/core/modbus-client-core-test.js` so Phase 3/4 can track removal.
Format:

```javascript
/* istanbul-ignore-inventory
  src/modbus-client.js:134         – verboseWarn (verbose setting guard)
  src/modbus-client.js:193         – first-init verboseWarn
  ... (all 27 entries)
*/
```

### Task 1.3 — GitHub issue mapping (completed 2026-06-13)

**Deliverable:** `docs/p4nr/capabilities/repo-quality-and-fsm-hardening-issues.md`

Triage source: [BiancoRoyal/node-red-contrib-modbus/issues](https://github.com/BiancoRoyal/node-red-contrib-modbus/issues)

**Open P0 (must fix in this capability):**

| Issue | Phase |
|-------|-------|
| [#569](https://github.com/BiancoRoyal/node-red-contrib-modbus/issues/569) Timeout + reconnect stuck | 2 |
| [#564](https://github.com/BiancoRoyal/node-red-contrib-modbus/issues/564) Silent communication failure | 2 + 3 |
| [#568](https://github.com/BiancoRoyal/node-red-contrib-modbus/issues/568) unitId vs unitid | 3 (Task 3.6) |

**Refresh command** (before each release candidate):

```
gh issue list --repo BiancoRoyal/node-red-contrib-modbus --state open --limit 20
```

Update `repo-quality-and-fsm-hardening-issues.md` if new bugs appear.

---

## Phase 2 — FSM Hardening

**Goal:** Harden reconnect **scheduling** — eliminate timer leaks and
**pathological** reconnect loops (parallel uncancelled timers, reconnect after
close) while **preserving** the intentional sequential reconnect retry cycle
(FR-FSM-06).  All changes are in `src/modbus-client.js` and
`src/core/modbus-client-core.js`.

> **Terminology (see Capability Spec §5.1.6):**
>
> | Preserve ✅ | Fix 🛠️ |
> |-------------|--------|
> | `reconnectOnTimeout=true` → repeat `RECONNECT → reconnecting → INIT → connectClient` every `reconnectTimeout` ms until success | Multiple simultaneous `setTimeout` chains without `clearTimeout` |
> | Multiple consecutive failed attempts (device offline 30 s → ~15 tries at 2 s) | Reconnect after `closingModbus=true` or node `STOP` |
> | Manual `reconnect` event → `CLOSE` → normal cycle | CPU spike from overlapping INIT/connectClient calls |
> | Defined end: deploy/stop, `closingModbus`, `reconnectOnTimeout=false` from `broken` | Fake `ACTIVATE` from `broken` when not connected |

**After each task:** `npm run build && npm test`

### Definition of Done (Phase 2)

- AC-03, AC-07, **AC-11**, **AC-12** from Capability Spec pass
- Existing reconnect flow tests in `test/units/flows/modbus-client-flows.js`
  with `reconnectOnTimeout: true` remain green (regression guard for FR-FSM-06)
- No new `/* istanbul ignore next */` introduced
- All 532 existing it/describe blocks still pass

### Task 2.0 — Reconnect behaviour contract tests (FR-FSM-06, FR-FSM-07, AC-11, AC-12)

**File:** `test/units/modbus-client-test.js`

Add **before** Task 2.1 implementation — these tests document the contract and
may initially fail on timer-leak paths:

```javascript
it('should perform sequential reconnect attempts after repeated failures (reconnectOnTimeout=true)', function (done) {
  // sinon.useFakeTimers()
  // Configure reconnectOnTimeout=true, reconnectTimeout=2000
  // Simulate: closed → RECONNECT → reconnecting → INIT → connectClient fails
  // Repeat 3× advancing clock by 2000ms each time
  // Assert: connectClient called exactly 3 times, never more than 1 pending timer
})

it('should stop reconnect when closingModbus becomes true mid-cycle', function (done) {
  // After 2 failed attempts, set closingModbus=true before next timer fires
  // Assert: no further INIT/connectClient; stateService.send('STOP') path respected
})
```

> **Important for Team 3:** A passing AC-11 test proves reconnect was **not**
> removed — only de-duplicated.  If `connectClient` is called fewer times than
> failure cycles, the implementation wrongly suppressed retries.

**Build:** `npm run build` (tests may fail until Tasks 2.1–2.3 land — expected in TDD)

### Task 2.1 — Fix reconnect timer leak (FR-FSM-01, FR-FSM-05, FR-FSM-07)

**File:** `src/modbus-client.js`

> **Scope note:** `clearTimeout` before each `setTimeout` **replaces** the
> pending delay for the **current** attempt with a fresh one — it does **not**
> cancel the retry cycle.  After the timer fires and connection still fails, the
> FSM re-enters `reconnecting` and schedules the **next** single timer (FR-FSM-06).

**Failing test first** (add to `test/units/modbus-client-test.js`):

```javascript
it('should clear pending reconnect timer before scheduling new one', function (done) {
  // Use sinon.useFakeTimers(); send RECONNECT twice; verify clearTimeout called
})
```

**Implementation steps:**

1. In `node.stateService.subscribe`, `reconnecting` handler:
   ```
   Before: setTimeout(() => { node.reconnectTimeoutId = 0; node.stateService.send('INIT') }, node.reconnectTimeout)
   After:
     clearTimeout(node.reconnectTimeoutId)
     node.reconnectTimeoutId = setTimeout(() => {
       node.reconnectTimeoutId = 0
       if (!node.closingModbus) { node.stateService.send('INIT') }  // FR-FSM-02
     }, node.reconnectTimeout)
   ```

2. In `init` handler, `isFirstInitOfConnection` branch:
   ```
   Before: setTimeout(node.connectClient, serialConnectionDelayTimeMS)
   After:
     clearTimeout(node.reconnectTimeoutId)
     node.reconnectTimeoutId = setTimeout(node.connectClient, serialConnectionDelayTimeMS)
   ```

3. In `init` handler, second branch (reconnect):
   ```
   Before: setTimeout(node.connectClient, node.reconnectTimeout)
   After:
     clearTimeout(node.reconnectTimeoutId)
     if (!node.closingModbus) {
       node.reconnectTimeoutId = setTimeout(node.connectClient, node.reconnectTimeout)
     }
   ```

**Build:** `npm run build`

### Task 2.2 — Guard `closed` state reconnect (FR-FSM-04)

**File:** `src/modbus-client.js`

**Failing test first** (add to `test/units/modbus-client-test.js`):

```javascript
it('should not send RECONNECT from closed state when closingModbus is true', function (done) {
  // Set closingModbus = true; trigger CLOSE event; verify stateService.send('RECONNECT') not called
})
```

**Implementation steps:**

In `closed` handler:
```
Before: node.stateService.send('RECONNECT')
After:
  if (!node.closingModbus) {
    node.stateService.send('RECONNECT')
  }
```

**Build:** `npm run build`

### Task 2.3 — Fix `broken` state inconsistency (FR-FSM-03)

**File:** `src/modbus-client.js`

> **Scope note:** This affects only `reconnectOnTimeout === false`.  When
> `reconnectOnTimeout === true`, behaviour is unchanged: `broken` still sends
> `RECONNECT` and enters the full retry cycle (FR-FSM-06).

**Failing test first** (add to `test/units/modbus-client-test.js`):

```javascript
it('should send INIT (not ACTIVATE) from broken state when reconnectOnTimeout is false', function (done) {
  // node.reconnectOnTimeout = false; trigger BREAK; verify next state is init not activated
})
```

**Implementation steps:**

In `broken` handler:
```
Before:
  if (node.reconnectOnTimeout) {
    node.stateService.send('RECONNECT')
  } else {
    node.stateService.send('ACTIVATE')
  }
After:
  if (node.reconnectOnTimeout) {
    node.stateService.send('RECONNECT')
  } else {
    node.stateService.send('INIT')  // clean reconnect, not fake-activate
  }
```

> **Backwards-compat note:** This changes observable FSM state for users with
> `reconnectOnTimeout = false`.  The previous behaviour (going to `activated`
> from a broken state) was arguably a bug — the client was not actually
> re-connected.  Document in CHANGELOG.

**Build:** `npm run build`

### Task 2.4 — Phase 2 gate

```
npm test          # must exit 0
npm run lint      # must exit 0
```

---

## Phase 3 — Modbus-Spec Compliance & Security

**Goal:** Validate all incoming `msg.payload` fields against the Modbus
Application Protocol Specification V1.1b3 before forwarding to the library.

**After each task:** `npm run build && npm test`

### Definition of Done (Phase 3)

- AC-04, AC-05, AC-06 from Capability Spec pass
- `/* istanbul ignore next */` count in `src/` reduced by ≥ 10 (from ~27 to ≤ 17)
- FR-SEC-01, FR-SEC-02 implemented

### Task 3.1 — Address and quantity range validation (FR-SPEC-01, FR-SPEC-02)

**File:** `src/core/modbus-client-core.js`

**Failing tests first** (add to `test/core/modbus-client-core-test.js`):

```javascript
it('should call cberr when address is 70000 (out of range)', ...)
it('should call cberr when address is -1', ...)
it('should call cberr when FC3 quantity is 200 (exceeds 125)', ...)
it('should call cberr when FC1 quantity is 0', ...)
it('should call cberr when FC1 quantity is 2001', ...)
it('should call cberr when FC16 quantity is 0', ...)
it('should call cberr when FC16 quantity is 124', ...) // valid
```

**Implementation steps:**

1. Add validation constants at top of `modbus-client-core.js`:
   ```javascript
   const MODBUS_ADDRESS_MIN = 0
   const MODBUS_ADDRESS_MAX = 65535
   const MODBUS_FC_QUANTITY_LIMITS = {
     1: { min: 1, max: 2000 },
     2: { min: 1, max: 2000 },
     3: { min: 1, max: 125 },
     4: { min: 1, max: 125 },
     15: { min: 1, max: 1968 },
     16: { min: 1, max: 123 }
   }
   ```

2. Add `validateAddressAndQuantity(msg, fc, cberr)` helper that:
   - Parses `msg.payload.address` as integer; rejects if not in [0, 65535]
   - Parses `msg.payload.quantity` as integer; rejects against per-FC limits
   - Returns `false` on failure (caller returns early), `true` on success

3. Call `validateAddressAndQuantity` at the top of `readModbusByFunctionCode`
   and at the top of each write FC function.

**Build:** `npm run build`

### Task 3.2 — FC5 coil write value mapping (FR-SPEC-03)

**File:** `src/core/modbus-client-core.js`

**Failing test first** (add to `test/core/modbus-client-core-test.js`):

```javascript
it('should coerce non-boolean truthy value to true for FC5', ...)
it('should coerce 0 to false for FC5', ...)
it('should coerce "0" string to false for FC5', ...)
```

**Implementation steps:**

In `writeModbusByFunctionCodeFive`:
```
Before:
  if (msg.payload.value) { msg.payload.value = true } else { msg.payload.value = false }
After:
  // Modbus spec V1.1b3 §6.5: write 0xFF00 for ON, 0x0000 for OFF
  // JavaScript coercion is intentional; "0" string is truthy — guard explicitly:
  const rawValue = msg.payload.value
  msg.payload.value = (rawValue !== 0 && rawValue !== '0' && rawValue !== false && rawValue !== null && rawValue !== undefined)
```

**Build:** `npm run build`

### Task 3.3 — Prototype pollution guard (FR-SEC-02)

**File:** `src/core/modbus-client-core.js`

**Failing test first** (add to `test/core/modbus-client-core-test.js`):

```javascript
it('should ignore __proto__ in dynamic reconnect payload', ...)
it('should ignore constructor in dynamic reconnect payload', ...)
```

**Implementation steps:**

In `setNewNodeOptionalSettings` and `setNewTCPNodeSettings` /
`setNewSerialNodeSettings`: add at the very top of `setNewNodeSettings`:

```javascript
const FORBIDDEN_KEYS = ['__proto__', 'constructor', 'prototype']
const payloadKeys = Object.keys(msg.payload || {})
if (payloadKeys.some(k => FORBIDDEN_KEYS.includes(k))) {
  nodeLog('Rejected payload with forbidden prototype keys')
  return false
}
```

**Build:** `npm run build`

### Task 3.4 — Queue depth cap (FR-QUEUE-01, FR-QUEUE-02)

**File:** `src/core/modbus-queue-core.js`  
**File:** `src/modbus-client.js` (new config key `maxQueueDepth`)

**Failing tests first** (add to `test/core/modbus-queue-core-test.js`):

```javascript
it('should reject message via cberr when queue depth exceeds maxQueueDepth', ...)
it('should not duplicate unitId entries in unitSendingAllowed', ...)
```

**Implementation steps:**

1. In `pushToQueueByUnitId`:
   ```javascript
   const maxDepth = node.maxQueueDepth || 100
   if (queueLength >= maxDepth) {
     reject(new Error('Queue full for UnitId ' + unitId + ' (max ' + maxDepth + ')'))
     return
   }
   ```

2. `unitSendingAllowed` dedup (sequential mode):
   ```javascript
   if (!node.parallelUnitIdsAllowed || node.clienttype === 'serial') {
     if (!node.unitSendingAllowed.includes(unitId)) {
       node.unitSendingAllowed.push(unitId)
     }
   }
   ```

3. In `ModbusClientNode` constructor (`src/modbus-client.js`):
   ```javascript
   this.maxQueueDepth = parseInt(config.maxQueueDepth) || 100
   ```

**Build:** `npm run build`

### Task 3.6 — `unitId` / `unitid` consistency (FR-API-01, AC-14)

**Files:** `src/core/modbus-client-core.js`, `test/core/modbus-client-core-test.js`

**Issues:** [#568](https://github.com/BiancoRoyal/node-red-contrib-modbus/issues/568),
[#482](https://github.com/BiancoRoyal/node-red-contrib-modbus/issues/482),
[#496](https://github.com/BiancoRoyal/node-red-contrib-modbus/issues/496)

**Failing test first:**

```javascript
it('should resolve unitId from msg.payload.unitId when integer', function () {
  // unitId: 0 must return 0, not fall through (no || truthiness)
})
it('should prefer unitId over unitid when both present', function () { ... })
```

**Implementation:** Update `getActualUnitId()` per FR-API-01 in capability spec.

**Build:** `npm run build`

### Task 3.5 — Phase 3 gate

```
npm test          # must exit 0
npm run lint      # must exit 0
```

Count `/* istanbul ignore next */`:
```
grep -c 'istanbul ignore next' src/modbus-client.js src/core/modbus-client-core.js src/core/modbus-queue-core.js
```
Must be lower than Phase 1 baseline.

---

## Phase 4 — Code Quality Refactor

**Goal:** Eliminate the global-namespace anti-pattern (`var de = de || …`); extract
duplicate code; reduce remaining `/* istanbul ignore next */` count.  **Standard.js**
lint (`npm run lint`) stays the style gate — no ESM migration; files remain CommonJS
(`require` / `module.exports`).

> **IMPORTANT:** Phase 4 changes are purely structural (same observable
> behaviour).  If any test fails after a namespace refactor, it indicates a
> `require()` path issue — fix the test import, not the logic.

**After each task:** `npm run build && npm test`

### Definition of Done (Phase 4)

- AC-08 (`grep -rc 'var de = de' src/` returns 0)
- AC-09 (`npm run lint` green)
- AC-10 (CHANGELOG entries present)
- **AC-15** (`package.json` version ≥ `5.46.0`, minor bump from baseline)
- `/* istanbul ignore next */` count in `src/` ≤ 5

### Task 4.1 — Refactor `src/core/modbus-core.js` namespace

**File:** `src/core/modbus-core.js`

This is the simplest module (no external state, pure functions).  Use as the
template for all subsequent namespace refactors.

**Failing test first:**

```javascript
// test/core/modbus-core-test.js — add one test verifying module.exports shape
it('should export getObjectId, getOriginalMessage, buildMessage, functionCodeModbusRead, functionCodeModbusWrite', ...)
```

**Implementation steps:**

Replace:
```javascript
var de = de || { biancoroyal: { modbus: { core: {} } } }
de.biancoroyal.modbus.core.internalDebug = ...
de.biancoroyal.modbus.core.ObjectID = ...
de.biancoroyal.modbus.core.getObjectId = function () { ... }
...
module.exports = de.biancoroyal.modbus.core
```

With:
```javascript
'use strict'
const internalDebug = require('debug')('contribModbus:core')
const ObjectID = require('bson').BSON.ObjectId

function getObjectId () { return new ObjectID() }
function getOriginalMessage (messageList, msg) { ... }
function functionCodeModbusRead (dataType) { ... }
function functionCodeModbusWrite (dataType) { ... }
function buildMessage (messageList, values, response, msg) { ... }

module.exports = { getObjectId, getOriginalMessage, functionCodeModbusRead, functionCodeModbusWrite, buildMessage }
```

Update all `require('./modbus-core')` call sites that use old property access
patterns.

**Build:** `npm run build`

### Task 4.2 — Refactor `src/core/modbus-queue-core.js` namespace

**File:** `src/core/modbus-queue-core.js`

Same pattern as Task 4.1.

**Failing test first:**

```javascript
it('should export initQueue, checkQueuesAreEmpty, dequeueCommand, pushToQueueByUnitId, ...',  ...)
```

Update import in `src/modbus-client.js` if property access paths change.

**Build:** `npm run build`

### Task 4.3 — Refactor `src/core/modbus-client-core.js` namespace

**File:** `src/core/modbus-client-core.js`

Same pattern.  This is the largest module; take care with
`de.biancoroyal.modbus.core.client.networkErrors` (used externally in
`modbus-client.js` as `coreModbusClient.networkErrors`).

**Failing test first:**

```javascript
it('should export createStateMachineService, networkErrors, messageAllowedStates, ...', ...)
```

**Build:** `npm run build`

### Task 4.4 — Refactor remaining core modules

**Files (in order):**
1. `src/core/modbus-server-core.js`
2. `src/core/modbus-io-core.js`
3. `src/modbus-basics.js`

Same pattern for each.  After each file:
```
npm run build && npm test
```

### Task 4.5 — FC dispatch table refactor (FR-CODE-02, FR-CODE-03)

**File:** `src/core/modbus-client-core.js`

**Failing test first** (add to `test/core/modbus-client-core-test.js`):

```javascript
it('should dispatch readModbus FC1 through FC4 via map', ...)
it('should dispatch writeModbus FC5, FC6, FC15, FC16 via map', ...)
it('should extract shared boilerplate between readModbus and customModbusMessage', ...)
```

**Implementation steps:**

1. Replace `readModbusByFunctionCodeOne/Two/Three/Four` with a map:

```javascript
const READ_FC_METHOD = {
  1: 'readCoils',
  2: 'readDiscreteInputs',
  3: 'readHoldingRegisters',
  4: 'readInputRegisters'
}
const READ_FC_METHOD_DEFORMED = {
  1: 'readCoils_deformedReadEnabled',
  2: 'readDiscreteInputs_deformedReadEnabled',
  3: 'readHoldingRegisters_deformedReadEnabled',
  4: 'readInputRegisters_deformedReadEnabled'
}

function readModbusByFunctionCode (node, msg, cb, cberr) {
  const fc = parseInt(msg.payload.fc)
  const method = msg.payload.enableDeformedMessages ? READ_FC_METHOD_DEFORMED[fc] : READ_FC_METHOD[fc]
  if (!method) {
    activateSendingOnFailure(node, cberr, new Error('Function Code Unknown'), msg)
    return
  }
  node.client[method](parseInt(msg.payload.address), parseInt(msg.payload.quantity))
    .then(resp => activateSendingOnSuccess(node, cb, cberr, resp, msg))
    .catch(err => { activateSendingOnFailure(node, cberr, new Error(err.message), msg); node.modbusErrorHandling(err) })
}
```

2. Extract shared `_prepareAndSend(node, msg, sendFn, cberr)` helper from
   `readModbus` and `customModbusMessage` (~40 duplicate lines).

**Build:** `npm run build`

### Task 4.6 — Remove `underscore` usage (FR-CODE-04)

**File:** `src/modbus-client.js`

Replace:
```javascript
const _ = require('underscore')
...
return _.isUndefined(node.actualServiceState) || ...
```

With:
```javascript
return node.actualServiceState === undefined || ...
```

Remove `const _ = require('underscore')` line.

> If `underscore` is used elsewhere in `src/`, list remaining usages and open
> a follow-on task.

**Build:** `npm run build`

### Task 4.7 — Reduce remaining `/* istanbul ignore next */` markers

For each remaining marker from the Phase 1 inventory:

1. If the branch can be reached in a unit test with sinon stubs or fake
   timers → **write the test and remove the marker**.
2. If the branch requires OS-level error injection (e.g., serial port failure
   on hardware) → **add a code comment** explaining the constraint and keep
   the marker.  These residual markers are acceptable.

Target: ≤ 5 remaining markers in `src/`.

**Build:** `npm run build`

### Task 4.8 — Phase 4 gate, CHANGELOG & version release (FR-REL-01, AC-15)

```
npm test          # must exit 0
npm run lint      # must exit 0
grep -rc 'var de = de' src/       # must return 0
grep -c 'istanbul ignore next' src/**/*.js  # must be ≤ 5
node -p "require('./package.json').version"   # must be ≥ 5.46.0
```

**Version bump (minimum minor — not patch-only):**

Baseline at spec time: `5.45.2`.  Target: **`5.46.0`** or higher minor.

```
# After conventional commits are in place:
npm run release -- --release-as 5.46.0
# If baseline already ≥ 5.46.x, use next minor instead, e.g.:
# npm run release -- --release-as 5.47.0
```

This runs `standard-version -a`, updates `package.json`, `CHANGELOG.md`, and
any files listed in standard-version config.  Verify:

- `package.json` `version` matches new `CHANGELOG.md` top heading
- CHANGELOG entries from Capability Spec §11 are included
- Git tag `v5.46.0` (or chosen version) ready for publish — **do not push**
  unless human GATE 2 approves

Fallback if `npm run release` fails: manually set `package.json` to `5.46.0` and
edit `CHANGELOG.md` (see review F-03).

**Files:** `package.json`, `CHANGELOG.md`

---

## Task Summary (flat list for p4nr-developer)

```
task_list:
  - id: 1.1
    phase: 1
    description: Verify baseline — npm test exits 0
    files: []
    test_cmd: npm test

  - id: 1.2
    phase: 1
    description: Inventory istanbul-ignore markers
    files: [test/core/modbus-client-core-test.js]
    test_cmd: npm run test:core

  - id: 1.3
    phase: 1
    description: GitHub issue triage — see repo-quality-and-fsm-hardening-issues.md
    files:
      - docs/p4nr/capabilities/repo-quality-and-fsm-hardening-issues.md
    test_cmd: (manual — gh issue list)

  - id: 2.0
    phase: 2
    description: Reconnect contract tests — sequential multi-attempt preserved, stop on close (AC-11, AC-12)
    files:
      - test/units/modbus-client-test.js
    test_cmd: npm run build && npm run mocha:base -- test/units/modbus-client-test.js

  - id: 2.1
    phase: 2
    description: Fix pathological timer overlap — clearTimeout before setTimeout (preserves retry cycle)
    files:
      - src/modbus-client.js
      - test/units/modbus-client-test.js
    test_cmd: npm run build && npm test

  - id: 2.2
    phase: 2
    description: Guard closed state reconnect against closingModbus
    files:
      - src/modbus-client.js
      - test/units/modbus-client-test.js
    test_cmd: npm run build && npm test

  - id: 2.3
    phase: 2
    description: Fix broken state — send INIT not ACTIVATE when reconnectOnTimeout=false
    files:
      - src/modbus-client.js
      - test/units/modbus-client-test.js
    test_cmd: npm run build && npm test

  - id: 2.4
    phase: 2
    description: Phase 2 gate — npm test must be 100% green
    files: []
    test_cmd: npm test && npm run lint

  - id: 3.1
    phase: 3
    description: Add address + quantity validation per Modbus spec
    files:
      - src/core/modbus-client-core.js
      - test/core/modbus-client-core-test.js
    test_cmd: npm run build && npm run test:core

  - id: 3.2
    phase: 3
    description: Fix FC5 coil value mapping — guard against string "0"
    files:
      - src/core/modbus-client-core.js
      - test/core/modbus-client-core-test.js
    test_cmd: npm run build && npm run test:core

  - id: 3.3
    phase: 3
    description: Add prototype-pollution guard in setNewNodeSettings
    files:
      - src/core/modbus-client-core.js
      - test/core/modbus-client-core-test.js
    test_cmd: npm run build && npm run test:core

  - id: 3.4
    phase: 3
    description: Implement queue depth cap + unitSendingAllowed dedup
    files:
      - src/core/modbus-queue-core.js
      - src/modbus-client.js
      - test/core/modbus-queue-core-test.js
    test_cmd: npm run build && npm run test:core

  - id: 3.6
    phase: 3
    description: unitId/unitid in getActualUnitId — fixes #568
    files:
      - src/core/modbus-client-core.js
      - test/core/modbus-client-core-test.js
    test_cmd: npm run build && npm run test:core

  - id: 3.5
    phase: 3
    description: Phase 3 gate — npm test + istanbul ignore count check; verify AC-13 P0 issues
    files: []
    test_cmd: npm test && npm run lint

  - id: 4.1
    phase: 4
    description: Namespace refactor — modbus-core.js
    files:
      - src/core/modbus-core.js
      - test/core/modbus-core-test.js
    test_cmd: npm run build && npm test

  - id: 4.2
    phase: 4
    description: Namespace refactor — modbus-queue-core.js
    files:
      - src/core/modbus-queue-core.js
      - src/modbus-client.js (import update)
      - test/core/modbus-queue-core-test.js
    test_cmd: npm run build && npm test

  - id: 4.3
    phase: 4
    description: Namespace refactor — modbus-client-core.js
    files:
      - src/core/modbus-client-core.js
      - src/modbus-client.js (import update)
      - test/core/modbus-client-core-test.js
    test_cmd: npm run build && npm test

  - id: 4.4
    phase: 4
    description: Namespace refactor — modbus-server-core.js, modbus-io-core.js, modbus-basics.js
    files:
      - src/core/modbus-server-core.js
      - src/core/modbus-io-core.js
      - src/modbus-basics.js
    test_cmd: npm run build && npm test

  - id: 4.5
    phase: 4
    description: FC dispatch table refactor + shared helper extraction
    files:
      - src/core/modbus-client-core.js
      - test/core/modbus-client-core-test.js
    test_cmd: npm run build && npm test

  - id: 4.6
    phase: 4
    description: Remove underscore dependency from modbus-client.js
    files:
      - src/modbus-client.js
    test_cmd: npm run build && npm test

  - id: 4.7
    phase: 4
    description: Remove/justify remaining istanbul ignore markers (target ≤ 5)
    files:
      - src/**/*.js (as identified in 1.2 inventory)
      - test/core/*-test.js (new tests per marker removed)
    test_cmd: npm run build && npm test

  - id: 4.8
    phase: 4
    description: Phase 4 gate + CHANGELOG + minor release (≥5.46.0)
    files:
      - CHANGELOG.md
      - package.json
    test_cmd: npm test && npm run lint && node -p "require('./package.json').version"
```

---

## Ordering & Dependencies

```
1.1 → 1.2 → 1.3
            ↓
          2.0 → 2.1 → 2.2 → 2.3 → 2.4
                              ↓
                      3.1 → 3.2 → 3.3 → 3.4 → 3.6 → 3.5
                                                  ↓
                               4.1 → 4.2 → 4.3 → 4.4 → 4.5 → 4.6 → 4.7 → 4.8
```

Task 2.0 (contract tests) MUST land before 2.1 so AC-11/AC-12 guard against
accidental reconnect suppression during timer cleanup.

Tasks 4.1 through 4.4 within Phase 4 MUST be done in the listed order (each
subsequent module may depend on the refactored exports of the previous one).
Tasks 3.1, 3.2, 3.3 within Phase 3 are independent and may be done in any
order; 3.4 depends on the validation infrastructure from 3.1.

---

## Test Suite Reference

| Suite | Command | Files | Blocks |
|-------|---------|-------|--------|
| Core | `npm run test:core` | `test/core/*-test.js` | ~226 |
| Units | `npm run test:units` | `test/units/*-test.js` | ~259 |
| Full | `npm test` | `test/**/*-test.js` | ~532 |
| Build | `npm run build` | `src/` → `modbus/` | — |
| Lint | `npm run lint` | `src/`, `test/` | — |

> Run `npm run test:core` after every `src/core/` change.  
> Run `npm test` at every phase gate.

---

*Ready for Team 2 review. After APPROVE, Team 3 begins at Task 1.1.*
