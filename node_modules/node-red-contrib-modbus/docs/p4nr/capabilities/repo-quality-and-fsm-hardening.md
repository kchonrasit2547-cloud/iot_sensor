# Capability Spec: Repo Quality & FSM Hardening

**Spec ID:** `repo-quality-and-fsm-hardening`
**Version:** v5 OSS LTS (`node-red-contrib-modbus` 5.x)
**Status:** AMENDED — reconnect semantics clarified (2026-06-13); Team 2 re-review recommended for §5.1.6 only
**Author:** p4nr-spec-author (Team 1)
**Date:** 2026-06-13
**Amendment:** 2026-06-13 — Phase-2 wording „reconnect loops“ präzisiert; legitime Mehrfachversuche explizit geschützt  
**Amendment:** 2026-06-13 — GitHub-Issue-Backlog verifiziert; Mapping in `repo-quality-and-fsm-hardening-issues.md`  
**Amendment:** 2026-06-13 — Mindest-Minor-Release **5.46.0** (Baseline 5.45.2) als FR-REL-01

---

## 1. Problem Statement

`node-red-contrib-modbus` has been maintained by many open-source contributors
over ~10 years, often under time pressure. The result is:

- **FSM race conditions** — `reconnectTimeoutId` is declared but never
  `clearTimeout()`'d; multiple simultaneous `setTimeout` chains can fire after
  a node is already closing (`closingModbus` not checked in `reconnecting →
  INIT` path).
- **Memory hazards** — `bufferCommandList` initialises 256 arrays at startup
  regardless of topology; `unitSendingAllowed` array grows unboundedly under
  rapid input; no queue-depth cap.
- **Modbus-spec violations** — `msg.payload.address` and `msg.payload.quantity`
  are forwarded to the serial library without range validation (address 0–65535,
  FC1/2 max 2000 coils, FC3/4 max 125 registers).  FC5 single-coil value is
  booleanised with JavaScript truthiness instead of mapping to the wire values
  0x0000 / 0xFF00 required by Modbus Application Protocol Specification V1.1b3,
  §6.5.
- **Security surface** — `msg.payload.unitid` override arrives from an external
  message and is forwarded to `client.setID()` after only partial validation in
  some paths.
- **Dead code / coverage gaps** — 27 `/* istanbul ignore next */` markers
  across 12 source files signal untested branches, many of which are error and
  reconnect handlers that users encounter in production.
- **Global namespace anti-pattern** — all six core modules use the archaic
  `var de = de || { biancoroyal: ... }` IIFE guard instead of plain CommonJS
  exports; this breaks tree-shaking, confuses static analysis, and makes
  dependency injection in tests fragile.
- **Stale GitHub issues** — the public issue tracker at
  [BiancoRoyal/node-red-contrib-modbus/issues](https://github.com/BiancoRoyal/node-red-contrib-modbus/issues)
  contains long-unresolved reports (many auto-staled) about connection instability,
  silent stalls, reconnect loops, queue deadlocks, and timeout storms. These
  symptoms map directly to the root causes above and MUST be closed with verified
  fixes as part of restoring leadership as the primary Node-RED Modbus package.

---

## 2. Goals

1. **FSM correctness** — guarantee that the XState FSM in `modbus-client.js`
   / `modbus-client-core.js` handles all reachable state transitions without
   dangling timers or **pathological** reconnect loops (see §5.1.6).  The
   **intentional reconnect retry cycle** with multiple sequential attempts MUST
   remain fully functional when `reconnectOnTimeout` is enabled.
2. **Modbus-spec compliance** — validate address, quantity, unit-id, and
   function-code values against the Modbus Application Protocol Specification
   V1.1b3 before forwarding to the serial library.
3. **Code readability** — replace archaic `var de = de || …` global-namespace
   guards with plain `module.exports`; keep **Standard.js** lint green; eliminate
   copy-pasted function-per-FC dispatch tables with a compact data-driven approach.
4. **Test coverage uplift** — remove every `/* istanbul ignore next */` that
   currently masks a real error path; add targeted Mocha unit tests so all
   existing 400+ test cases keep passing and the new branches are covered.
5. **No breaking changes** — the public Node-RED message contract
   (`msg.payload.*`) must remain identical; internal refactors only.
6. **Issue backlog catch-up** — map open and historically stale GitHub issues
   to concrete FRs/phases; verify fixes on release and communicate in CHANGELOG
   so the community sees sustained maintenance (see §8 and
   `repo-quality-and-fsm-hardening-issues.md`).
7. **Minor release** — ship this work as at least one **minor** version increment
   on the v5 line (not a patch-only release); see §7.1 and FR-REL-01.

---

## 3. Scope

### 3.1 In-scope (v5 OSS)

| Area | Description |
|------|-------------|
| `src/modbus-client.js` | FSM subscription, reconnect timer cleanup, `closingModbus` guard |
| `src/core/modbus-client-core.js` | FC dispatch tables, address/quantity/unitid validation |
| `src/core/modbus-queue-core.js` | Queue-depth cap, `unitSendingAllowed` drain guard |
| `src/modbus-basics.js` | Minor: type-safe `sendEmptyMsgOnFail` |
| `src/core/modbus-core.js` | Namespace guard removal → plain `module.exports` (FR-CODE-01) |
| All `src/core/*.js` | Namespace anti-pattern removal |
| `test/core/`, `test/units/` | New regression tests for previously ignored branches |
| `CHANGELOG.md` | One entry per user-visible improvement |
| `package.json` | Version bump — minor increment minimum (FR-REL-01) |

### 3.2 Out-of-scope (not in v5)

- TLS transport (`Modbus-Client-TLS`) — v6 closed only
- Server package split — v6 architecture
- `winston` logging — v6 only
- Scoped package rename (`@plus4nodered/...`) — v6 only
- New Node-RED UI surface / HTML changes (separate spec if needed)
- E2E test infrastructure changes beyond running existing suite

---

## 4. Non-Goals

- No breaking changes to `msg.payload` contract without a separate, explicitly
  approved breaking-change spec.
- No removal of the `Modbus-Server` node; it stays in this package.
- No changes to `modbus/` (built output) except as produced by `npm run build`.
- No migration away from `@xstate/fsm` or `@openp4nr/modbus-serial` in v5.

---

## 5. Functional Requirements

### 5.1 FSM Robustness

**FR-FSM-01** — Timer leak prevention  
The `reconnectTimeoutId` variable introduced in `modbus-client.js` (line 99)
MUST be used to store the result of `setTimeout()` for the reconnect delay.
Before scheduling a new reconnect, any pending timer MUST be cancelled via
`clearTimeout(node.reconnectTimeoutId)`.

**FR-FSM-02** — Guard against reconnect after close  
The `reconnecting → INIT` path MUST check `node.closingModbus` before
calling `node.stateService.send('INIT')`.  If `closingModbus` is `true`,
the timer callback MUST be a no-op.

**FR-FSM-03** — `broken` state consistency  
When `reconnectOnTimeout` is `false`, the `broken` handler currently sends
`ACTIVATE`. This is inconsistent — the node is broken but not re-activating a
live connection.  The handler MUST send `INIT` in this case (same as the
`reconnecting` path) to ensure a clean reconnect attempt.

**FR-FSM-04** — `closed` state auto-reconnect opt-out  
The `closed` handler currently unconditionally sends `RECONNECT`.  It MUST
check `node.closingModbus` first and skip `RECONNECT` when `true`.

**FR-FSM-05** — `init` state double-connect guard  
`setTimeout(node.connectClient, ...)` is called from the `init` handler.
A second call while the first `connectClient` is still pending MUST be
prevented (check `node.reconnectTimeoutId !== 0` before scheduling).

> **Clarification (FR-FSM-05):** This guard prevents **stacking two timers for
> the same pending transition**.  It does **not** prevent the next reconnect
> attempt after the current timer fires and the connection still fails.  Each
> failed cycle may schedule exactly one new timer — never two in parallel.

**FR-FSM-06** — Preserve intentional reconnect retry cycle  
When `reconnectOnTimeout === true` (Node default) and the node is not closing,
the FSM MUST continue to perform **sequential reconnect attempts** after
transient failures.  One full attempt cycle is:

```
closed|broken|failed
  → RECONNECT → reconnecting
  → (wait reconnectTimeout ms) → INIT
  → (wait serialConnectionDelayTimeMS or reconnectTimeout) → connectClient()
  → success: connected → activated
  → failure: failed|broken → (repeat while reconnectOnTimeout && !closingModbus)
```

Multiple consecutive failures MUST still produce further attempts at the
configured `reconnectTimeout` interval (default 2000 ms).  Phase 2 MUST NOT
remove, cap, or disable this behaviour unless an explicit end condition in
§5.1.6 applies.

**FR-FSM-07** — Single active reconnect timer  
At any point in time there MUST be **at most one** pending reconnect-related
timer stored in `node.reconnectTimeoutId` (covering the `reconnecting → INIT`
delay and the `init → connectClient` delay).  Clearing and rescheduling this
timer for the **next** attempt is required and expected; running several
uncancelled timers in parallel is the defect this spec eliminates.

### 5.1.6 Reconnect Semantics — Terminology & End Conditions

Industrial Modbus deployments rely on automatic reconnect after device or
network outages.  Phase 2 hardens **how** reconnect is scheduled, not **whether**
reconnect happens.  The following terms MUST be used consistently in code,
tests, plans, and CHANGELOG entries:

| Term | Meaning | Phase 2 action |
|------|---------|----------------|
| **Intentional reconnect retry cycle** | One timer → one `INIT` → one `connectClient()`; on failure, the cycle repeats after `reconnectTimeout` | **Preserve** — this is desired production behaviour |
| **Pathological reconnect loop** | Multiple uncancelled timers fire in parallel; `INIT`/`connectClient` re-entrancy; reconnect after node close; CPU spike from overlapping schedules | **Eliminate** — root cause of stale GitHub reports |

#### Intended end conditions (reconnect MUST stop)

Reconnect attempts MUST cease when any of the following is true.  These
conditions already exist in v5; Phase 2 MUST NOT weaken them and MUST add
guards where they are currently missing:

| # | Condition | FSM / code path | Expected result |
|---|-----------|-----------------|-----------------|
| E-01 | Node deploy / stop | `on('close')` sets `closingModbus = true`, sends `STOP` → `stopped` | No further `RECONNECT`, `INIT`, or `connectClient` |
| E-02 | Reconnect timer fires while closing | `reconnecting → INIT` callback with `closingModbus === true` | Timer callback is no-op (FR-FSM-02) |
| E-03 | `closed` while closing | `closed` handler with `closingModbus === true` | No `RECONNECT` sent (FR-FSM-04) |
| E-04 | `reconnectOnTimeout === false` after `broken` | `broken` handler sends `INIT` once (FR-FSM-03), not `RECONNECT` | No automatic infinite retry from `broken`; user may still trigger manual reconnect via `reconnect` event |
| E-05 | Connection succeeds | `connectClient()` succeeds → `connected` → `activated` | Retry cycle ends naturally until next disconnect |

#### Explicit non-goals for reconnect (out of Phase 2 scope)

- Adding a global **max reconnect attempt count** on `Modbus-Client` — not in
  v5 today; would be a separate additive spec if needed.
- Wiring `maxReconnectsPerMinute` from `modbus-flex-connector` into the client
  FSM — config exists in HTML but is **not implemented** in client code; do not
  silently activate in Phase 2.
- Disabling auto-reconnect from the `closed` state when `reconnectOnTimeout` is
  `true` — current behaviour; unchanged unless a future spec says otherwise.

#### Observable behaviour after Phase 2 (acceptance narrative)

> *Device goes offline for 30 s with `reconnectOnTimeout: true`,
> `reconnectTimeout: 2000`:* the client enters `reconnecting`, waits 2 s,
> attempts `connectClient`, fails, re-enters `broken`/`closed`, schedules the
> **next** single timer, and repeats ~15 times until the device returns — **one
> timer at a time**, no CPU spike.
>
> *User redeploys the flow while reconnecting:* `closingModbus` becomes `true`,
> pending timer is cleared or its callback no-ops, FSM reaches `stopped` — **no
> further reconnect attempts**.

### 5.2 Queue Hardening

**FR-QUEUE-01** — Queue depth cap  
`pushToQueueByUnitId` MUST enforce a configurable maximum queue depth per
unit-id (default: 100 commands).  When the queue is full, the new command
MUST be rejected with a descriptive error passed to `cberr`.

**FR-QUEUE-02** — `unitSendingAllowed` drain guard  
The `unitSendingAllowed` array (sequential dequeue list) MUST NOT grow beyond
`256 × maxQueueDepth` entries.  If the array already contains a pending entry
for the same `unitId`, the duplicate MUST be silently dropped.

**FR-QUEUE-03** — Lazy queue initialisation  
`initQueue` MUST only allocate per-unit arrays for unit-ids that are actually
used, or retain the current eager allocation but document the memory budget
explicitly (256 arrays × maxQueueDepth entries).

### 5.3 Modbus-Spec Compliance

**FR-SPEC-01** — Address range validation  
Before calling any `node.client.read*` or `node.client.write*` method,
`msg.payload.address` MUST be an integer in `[0, 65535]`.  Out-of-range values
MUST call `cberr` with a descriptive `Error` and MUST NOT forward to the
serial library.

**FR-SPEC-02** — Quantity range validation  
`msg.payload.quantity` MUST be validated per function code:
- FC 1, 2: `[1, 2000]`
- FC 3, 4: `[1, 125]`
- FC 15: `[1, 1968]`
- FC 16: `[1, 123]`

**FR-SPEC-03** — FC5 coil write value  
`writeModbusByFunctionCodeFive` MUST map `msg.payload.value` to `true`
(→ 0xFF00 on wire) or `false` (→ 0x0000 on wire) using strict boolean
semantics. The current implicit truthiness coercion is retained for backwards
compatibility, but the mapping MUST be explicit and documented.

**FR-SPEC-04** — Unit-id validation path completeness  
`getActualUnitId` (client-core, line 50) uses `msg.payload.unitid` directly if
it is an integer, but the result is later validated by `checkUnitId` in
`setUnitIdFromPayload`.  This is acceptable; the code MUST be made legible with
an inline comment referencing the validation call-site.

### 5.4 Message API Consistency

**FR-API-01** — Accept both `unitId` and `unitid` in payload  
`getActualUnitId()` MUST accept `msg.payload.unitId` and `msg.payload.unitid`
when the value is an integer in `[0, 255]`.  Precedence: check `unitId` first,
then `unitid`, then `msg.queueUnitId`, then `node.unit_id`.  MUST NOT use
truthiness (`||`) because unit address **0** is valid.  Additive only —
document `unitid` as canonical in help text; `unitId` supported for gateway/proxy
plumbing ([#568](https://github.com/BiancoRoyal/node-red-contrib-modbus/issues/568),
[#482](https://github.com/BiancoRoyal/node-red-contrib-modbus/issues/482),
[#496](https://github.com/BiancoRoyal/node-red-contrib-modbus/issues/496)).

### 5.5 Code Quality

> **Standard.js vs CommonJS — not the same thing**
>
> | Tool / concept | Role in v5 OSS | This spec |
> |----------------|----------------|-----------|
> | **[Standard.js](https://standardjs.com/)** | Style linter — `npm run lint` → `standard --fix` (`package.json`) | **Already in use.** AC-09: must stay green after every phase. No migration away from Standard.js. |
> | **CommonJS** | Module system — `require()` / `module.exports` in all `src/` files | **Stays.** v5 is not moving to ESM/`import` in this capability. |
> | **`var de = de \|\| …` pattern** | Legacy global namespace inside CommonJS files (predates clean exports) | **FR-CODE-01 removes this** — refactor to `module.exports = { … }` without changing the module system. |
>
> FR-CODE-01 is **not** a choice between Standard.js and CommonJS. It cleans up
> an outdated namespace idiom while keeping both Standard.js lint rules and
> CommonJS modules unchanged.

**FR-CODE-00** — Standard.js compliance maintained  
All changes MUST pass `npm run lint` (Standard.js).  No ESLint config introduction;
no style-rule suppressions added except where unavoidable with an inline comment
and justification.  Existing `// eslint-disable-line` on namespace lines are
removed when FR-CODE-01 refactors those files.

**FR-CODE-01** — Global namespace guard removal (within CommonJS)  
All six files using `var de = de || { biancoroyal: ... }` MUST be refactored
to plain `module.exports = { ... }` objects.  The public API shape (exported
function names) MUST remain identical; only the internal namespace guard is
removed.  Files remain CommonJS — no ESM conversion.

**FR-CODE-02** — FC dispatch table  
The six read-FC functions (`readModbusByFunctionCodeOne` …
`readModbusByFunctionCodeFour` + default) and four write-FC functions MUST be
replaced with a data-driven dispatch map to eliminate copy-paste.

**FR-CODE-03** — Duplicate function removal  
`readModbus` and `customModbusMessage` in `modbus-client-core.js` share ~40
lines of identical boilerplate.  The shared portion MUST be extracted into a
private helper.

**FR-CODE-04** — `underscore` dependency reduction  
`_.isUndefined` (one call in `modbus-client.js`) MUST be replaced with a
standard `=== undefined` check to allow future removal of the `underscore`
dependency without a breaking diff.

**FR-CODE-05** — Istanbul ignore removal  
Each `/* istanbul ignore next */` marker in `src/` MUST either be replaced by
a Mocha test that exercises the branch, or be justified in a code comment
explaining why testing is not feasible (e.g., OS-level error injection).
Unexplained markers remaining after the work MUST be counted in CHANGELOG.

### 5.6 Security

**FR-SEC-01** — Payload input sanitisation  
`msg.payload.address`, `msg.payload.quantity`, and `msg.payload.value`
originate from user flows and MUST be sanitised (integer parse + range check)
before use.  Invalid types (e.g., strings, objects) MUST call `cberr`.

**FR-SEC-02** — No prototype pollution  
`setNewNodeSettings` and `setNewNodeOptionalSettings` accept `msg.payload`
fields and assign them to `node.*` properties.  These MUST NOT assign to
`__proto__`, `constructor`, or `prototype`.  A deny-list check MUST be added.

### 5.7 Release Versioning

**FR-REL-01** — Minimum minor version bump  
This capability MUST be released with at least one **minor** increment on the
v5 semver line.  Patch-only releases (e.g. `5.45.2` → `5.45.3`) are **not**
sufficient for the scope of FSM hardening, spec validation, queue caps, and
issue-backlog fixes.

| Field | Value |
|-------|-------|
| Baseline (start of work) | `5.45.2` (`package.json`) |
| Minimum release target | **`5.46.0`** |
| Bump rule | Second segment (`5.45` → `5.46`); reset patch to `0` |
| Tooling | `npm run release -- --release-as 5.46.0` (or next minor if baseline already moved) |

Team 3 applies the version bump in **Task 4.8** after all tests green.  The
version in `package.json` MUST match the top entry in `CHANGELOG.md`.  npm
publish / GitHub release tag MUST use the same version string.

> **Rationale:** Multiple user-visible fixes ([#569](https://github.com/BiancoRoyal/node-red-contrib-modbus/issues/569),
> [#564](https://github.com/BiancoRoyal/node-red-contrib-modbus/issues/564),
> [#568](https://github.com/BiancoRoyal/node-red-contrib-modbus/issues/568)),
> additive config (`maxQueueDepth`), and behavioural FSM corrections warrant a
> minor signal to downstream flows and package managers — not a silent patch.

---

## 6. Acceptance Criteria

| ID | Criterion | Measurement |
|----|-----------|-------------|
| AC-01 | All existing tests pass | `npm test` exits 0 |
| AC-02 | No new `/* istanbul ignore next */` introduced | `grep -c 'istanbul ignore next' src/**/*.js` does not increase |
| AC-03 | `reconnectTimeoutId` stores live timer handle | Code review: `clearTimeout` called before every `setTimeout` in reconnect paths |
| AC-04 | Out-of-range address rejected with `cberr` | New unit test: send FC3 with address 70000 → `cberr` called |
| AC-05 | Out-of-range quantity rejected with `cberr` | New unit test: send FC3 with quantity 200 → `cberr` called |
| AC-06 | Queue depth capped at configurable max | New unit test: push 101 messages → 101st rejected via `cberr` |
| AC-07 | `closingModbus` guard in reconnect timer | New unit test: trigger reconnect then close → second INIT not sent |
| AC-11 | Intentional multi-attempt reconnect preserved | New unit test: with fake timers, simulate 3 consecutive connection failures with `reconnectOnTimeout=true` → exactly 3 sequential `connectClient` attempts at `reconnectTimeout` intervals; at no point more than one pending timer |
| AC-12 | Reconnect stops on defined end | New unit test: after 2 failed attempts, set `closingModbus=true` before timer fires → no further `INIT`/`connectClient`; FSM reaches `stopped` |
| AC-08 | No `var de = de || ...` in `src/` | `grep -rc 'var de = de' src/` returns 0 |
| AC-09 | Standard.js lint passes | `npm run lint` exits 0 (Standard package, not ESLint) |
| AC-10 | CHANGELOG has one entry per user-visible fix | Manual review |
| AC-13 | Open P0 GitHub issues addressed | [#569](https://github.com/BiancoRoyal/node-red-contrib-modbus/issues/569), [#564](https://github.com/BiancoRoyal/node-red-contrib-modbus/issues/564) verified fixed or commented with repro steps |
| AC-14 | `unitId`/`unitid` both accepted | New unit test: payload with `unitId: 0` and `unitid: 0` both resolve correctly (FR-API-01) |
| AC-15 | Minor version release | `package.json` `version` ≥ `5.46.0` and ≥ baseline minor + 1; matches `CHANGELOG.md` header (FR-REL-01) |

---

## 7. Backwards Compatibility

### 7.1 Release versioning (FR-REL-01)

All changes below remain **backwards compatible** at the message/API level, but
the **package version MUST increase by at least one minor** (`5.45.x` → `5.46.0`
minimum) so operators and CI can distinguish this maintenance wave from patch
hotfixes.

All changes are **internal refactors** and **additive hardening**:

- Message contract (`msg.payload.address`, `.quantity`, `.value`, `.fc`,
  `.unitid`) is unchanged.
- Node-RED node names and configuration keys are unchanged.
- New `maxQueueDepth` config option for `Modbus-Client` is **additive** (default
  100 preserves current unbounded behaviour approximately for real-world flows).
- Stricter Modbus-spec validation (FR-SPEC-01/02) may reject previously accepted
  out-of-spec messages.  This is a **bug-fix**, not a breaking change, but MUST
  be documented in CHANGELOG.

---

## 8. GitHub Issue Backlog

**Live tracker:** [github.com/BiancoRoyal/node-red-contrib-modbus/issues](https://github.com/BiancoRoyal/node-red-contrib-modbus/issues)

**Full triage table:** `docs/p4nr/capabilities/repo-quality-and-fsm-hardening-issues.md`

### 8.0 Open issues (2026-06-13)

| Issue | Title | Maps to |
|-------|-------|---------|
| [#569](https://github.com/BiancoRoyal/node-red-contrib-modbus/issues/569) | Timed out at modbus-client-core.js:44; stuck Initialized/Reconnecting | §8.1, §8.3 — **P0** Phase 2 |
| [#564](https://github.com/BiancoRoyal/node-red-contrib-modbus/issues/564) | Silent Modbus failure; manual disable/enable restores | §8.1 — **P0** Phase 2+3; see [#553](https://github.com/BiancoRoyal/node-red-contrib-modbus/issues/553) |
| [#568](https://github.com/BiancoRoyal/node-red-contrib-modbus/issues/568) | `unitId` vs `unitid` inconsistency (Stale) | §8.6 — **P1** Phase 3 FR-API-01 |

PR [#570](https://github.com/BiancoRoyal/node-red-contrib-modbus/pull/570) references several
open issues; this P4NR spec remains the gate for structured v5 OSS delivery.

### 8.1 Reconnect / Connection Instability

Two distinct phenomena are conflated in issue titles — Phase 2 addresses only
the second:

1. **Legitimate retry (not a bug):** `RECONNECT → reconnecting → INIT → connect`
   repeats every `reconnectTimeout` ms while the peer is down and
   `reconnectOnTimeout === true`.  This is **expected** and MUST remain after
   Phase 2 (FR-FSM-06).

2. **Pathological loop (bug):** multiple overlapping timers after a single
   disconnect; CPU spikes; reconnect continues after node close; FSM never
   reaches `activated` because parallel `INIT` chains interfere with each other.

Root cause of (2): FR-FSM-01, FR-FSM-02, FR-FSM-04, FR-FSM-07.

Representative issues: [#569](https://github.com/BiancoRoyal/node-red-contrib-modbus/issues/569),
[#564](https://github.com/BiancoRoyal/node-red-contrib-modbus/issues/564),
[#553](https://github.com/BiancoRoyal/node-red-contrib-modbus/issues/553),
[#472](https://github.com/BiancoRoyal/node-red-contrib-modbus/issues/472),
[#451](https://github.com/BiancoRoyal/node-red-contrib-modbus/issues/451),
[#416](https://github.com/BiancoRoyal/node-red-contrib-modbus/issues/416),
[#458](https://github.com/BiancoRoyal/node-red-contrib-modbus/issues/458) —
distinguish perpetual **sequential** retry (OK) from **parallel** timer storm (bug).

### 8.2 Queue Deadlocks / Message Loss

Symptoms: messages queued but never sent; `sending` state entered but dequeue
never fires; node appears active but produces no output.

Root cause: FR-QUEUE-01 (unbounded queue consumes memory), FR-QUEUE-02
(`unitSendingAllowed` stale entries), serialSendingAllowed flag not reset on
certain failure paths.

Representative issues: [#549](https://github.com/BiancoRoyal/node-red-contrib-modbus/issues/549),
[#409](https://github.com/BiancoRoyal/node-red-contrib-modbus/issues/409),
[#517](https://github.com/BiancoRoyal/node-red-contrib-modbus/issues/517),
[#487](https://github.com/BiancoRoyal/node-red-contrib-modbus/issues/487).

### 8.3 Timeout Storms

Symptoms: after a disconnect, tens of simultaneous timeout errors flood the
Node-RED log; performance degrades.

Root cause: FR-FSM-01 (timer not cleared), FR-FSM-05 (double-connect on init).

Representative issues: [#569](https://github.com/BiancoRoyal/node-red-contrib-modbus/issues/569),
[#540](https://github.com/BiancoRoyal/node-red-contrib-modbus/issues/540),
[#520](https://github.com/BiancoRoyal/node-red-contrib-modbus/issues/520).

### 8.4 Out-of-Spec Modbus Values Accepted

Symptoms: sending address 70000 does not produce an error; Modbus device
returns exception code 2 (Illegal Data Address) but node does not surface it
clearly.

Root cause: FR-SPEC-01, FR-SPEC-02.

Representative issues: "no error when address is out of range", "FC15 accepts
wrong quantity".

### 8.5 FC5 Coil Write Behaviour

Symptoms: writing `0` to a coil sometimes turns it on (truthy coercion from
non-zero numeric string).

Root cause: FR-SPEC-03.

Representative issues: "writeCoil with value 0 does not turn off coil".

### 8.6 Message API Consistency

Symptoms: flows chaining client output to flex-getter need a Function node to
rename `unitId` → `unitid`; unit address 0 mishandled if truthiness used.

Root cause: FR-API-01.

Issues: [#568](https://github.com/BiancoRoyal/node-red-contrib-modbus/issues/568) (open),
[#482](https://github.com/BiancoRoyal/node-red-contrib-modbus/issues/482),
[#496](https://github.com/BiancoRoyal/node-red-contrib-modbus/issues/496).

---

## 9. Risks & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Timer refactor breaks reconnect timing in edge cases | Medium | High | Keep identical `reconnectTimeout` ms values; add unit test with fake timers (sinon) |
| CommonJS refactor breaks test `require()` paths | Medium | High | Tests import from `../../src/` — run full suite after each module refactor; fix import paths in tests if needed |
| Stricter validation rejects user flows that relied on out-of-spec values | Low | Medium | Document in CHANGELOG; provide migration note in README |
| Queue cap (FR-QUEUE-01) causes message loss in high-throughput flows | Low | High | Default cap of 100 is conservative; expose as `maxQueueDepth` config; document |
| Namespace removal introduces `require()` caching differences | Low | Low | Verify with `npm test` after each module; no global state shared across tests |
| `underscore` removal ripple effect | Low | Low | Single call site; trivial replacement |

---

## 10. Test Strategy

### 10.1 Existing test gates (must stay green)

```
npm run test:core    # test/core/*-test.js  — 226 it/describe blocks
npm run test:units   # test/units/*-test.js — 259 it/describe blocks
npm test             # full suite + lint    — 532 it/describe blocks total
```

### 10.2 New tests to add

| Test file | New cases | Target FR |
|-----------|-----------|-----------|
| `test/units/modbus-client-test.js` | Reconnect timer cleanup, multi-attempt preserved, closingModbus guard | FR-FSM-01–07, AC-11/12 |
| `test/core/modbus-client-core-test.js` | FC dispatch map, address/quantity validation, FC5 coil, unitId/unitid | FR-SPEC-01/02/03, FR-API-01, FR-CODE-02 |
| `test/core/modbus-queue-core-test.js` | Queue depth cap, unitSendingAllowed drain guard | FR-QUEUE-01/02 |
| `test/core/modbus-core-test.js` | Namespace refactor: verify exported API shape unchanged | FR-CODE-01 |

### 10.3 Coverage target

After Phase 3 (see Plan), `/* istanbul ignore next */` count in `src/` MUST be
≤ 5 (down from current 27).  Residual markers MUST have code comments
explaining why branch testing is not feasible.

---

## 11. CHANGELOG Note Requirement

The following CHANGELOG entries MUST be included (conventional-changelog format):

```
fix(client): prevent reconnect timer leak on rapid disconnect/reconnect
fix(fsm): guard reconnect path against closingModbus flag
fix(queue): cap per-unit queue depth to prevent memory growth
fix(spec): validate Modbus address and quantity ranges before sending
fix(spec): fix FC5 coil value mapping to 0x0000/0xFF00
fix(api): accept msg.payload.unitId and unitid in getActualUnitId (fixes #568)
refactor(core): replace de.biancoroyal namespace guards with module.exports
refactor(client): replace per-FC copy-paste with data-driven dispatch map
```

---

## 12. Node-RED Surface Impact

No changes to:
- Node names (`modbus-client`, `modbus-read`, etc.)
- Node configuration keys in `.html` files
- `msg.payload` output contract
- `msg.topic`, `msg.responseBuffer`, `msg.values` shape

New optional config key on `Modbus-Client`:
- `maxQueueDepth` (integer, default 100) — visible in node editor, requires
  HTML + locale change (separate minor spec or addendum here).

---

*Handoff to Team 2 (p4nr-spec-reviewer) for APPROVE/REJECT.*
