# Capability Spec: Shared Client Deregister Isolation (#423 / #487)

**Spec ID:** `shared-client-deregister-isolation`  
**Version:** v5 OSS LTS (`node-red-contrib-modbus` 5.x)  
**Status:** READY FOR REVIEW  
**Author:** p4nr-spec-author (Team 1)  
**Date:** 2026-07-21  
**Related:** GitHub #423, #487 (disable/delete one consumer closes siblings on same client)

---

## 1. Problem Statement

When multiple consumer nodes (Flex-Getter, Read, Write, …) share one
`modbus-client` config node:

- Disabling, deleting, or redeploying **one** consumer closes / stops **all**
  siblings on that client.
- Consumers on **other** clients are unaffected (confirms per-client bug).

Root causes in `src/modbus-client.js`:

1. `registerForModbus(node)` uses the **node object** as object-key → all
   coerce to `"[object Object]"`, so the registry never tracks multiple users.
2. `deregisterForModbus(node.id)` deletes by **string id** (mismatch).
3. Even when other users remain, `closeConnectionWithoutRegisteredNodes` calls
   `setStoppedState` → FSM `STOP` + `mbderegister` / `mbclosed` → all listeners
   show closed / stop working.

---

## 2. Goals

1. Registry keys are always **node id strings**.
2. Deregister of one consumer while others remain: **no** FSM `STOP`, **no**
   connection close, siblings keep working.
3. Deregister of the **last** consumer: close connection and stop as today.
4. Backwards compatible public API (`registerForModbus` still accepts node or id).

---

## 3. Scope

### In-scope

| Area | Change |
|------|--------|
| `src/modbus-client.js` | Normalize id; fix deregister / close-when-empty |
| `test/units/modbus-client-test.js` | Cover multi-consumer deregister |
| CHANGELOG | User-visible bugfix |
| GitHub #423 | Follow-up comment after fix |

### Out-of-scope

- Changing Node-RED shared-config UX (one client config shared by design)
- Separate TCP connection per consumer (would be a major feature)
- Serial multi-client (hardware limitation remains)

---

## 4. Functional Requirements

### FR-SCI-01 — Registry by id

`registerForModbus(x)` and `deregisterForModbus(x, done)` MUST resolve
`x` to `x.id` when `x` is a node object, else use `x` as string id.

### FR-SCI-02 — Partial deregister

If after delete `registeredNodeList` still has entries, deregister MUST
call `done()` and MUST NOT send FSM `STOP` and MUST NOT close the socket.

### FR-SCI-03 — Last deregister

If `registeredNodeList` becomes empty, existing close/stop behaviour applies
(`closingModbus`, client close, `setStoppedState`).

### FR-SCI-04 — First register

When transitioning from 0 → 1 registered users, existing `NEW`/`INIT` behaviour
applies. Additional registers MUST NOT restart the FSM unnecessarily.

### FR-SCI-05 — Legacy key cleanup

On deregister, if a stale `"[object Object]"` key exists (from older buggy
registers in the same process), it SHOULD be removed so length is accurate.

---

## 5. Non-Functional

- No breaking change to message APIs or palette UI.
- Mocha unit tests for register-two / deregister-one / deregister-last.

---

## 6. Acceptance

1. Two Flex-Getters on one client: disable one → other stays connected/active.
2. Delete the disabled one → remaining stays active.
3. Disable/delete the last consumer → client stops/closes.
4. Unit tests pass; `npm run build` after `src/` change.
