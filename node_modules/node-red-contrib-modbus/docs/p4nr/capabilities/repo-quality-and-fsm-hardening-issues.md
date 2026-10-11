# GitHub Issue Backlog — Repo Quality & FSM Hardening

**Tracker:** [BiancoRoyal/node-red-contrib-modbus/issues](https://github.com/BiancoRoyal/node-red-contrib-modbus/issues)  
**Capability Spec:** `repo-quality-and-fsm-hardening.md`  
**Last triage:** 2026-06-13 (via `gh issue list`)  
**Maintainer context:** Viele Issues wurden über Jahre aus Zeitgründen nicht bearbeitet
(Stale-Label, auto-close droht). Dieses Mapping priorisiert die Aufholjagd für v5 OSS,
damit das Paket wieder als führendes Modbus-Contrib für Node-RED gilt.

---

## 1. Open issues (P0 — must address in this capability)

| Issue | Title | Symptom group | Spec / Phase | Priority | Expected fix |
|-------|-------|---------------|--------------|----------|--------------|
| [#569](https://github.com/BiancoRoyal/node-red-contrib-modbus/issues/569) | Error: Timed out at modbus-client-core.js:44:15 | §8.1 Reconnect, §8.3 Timeout | Phase 2 (FR-FSM-01–07), Phase 3 (timeout path) | **P0** | Timer cleanup + FSM recovery; NR 4.1.x compat verified in tests |
| [#564](https://github.com/BiancoRoyal/node-red-contrib-modbus/issues/564) | Modbus Communication Failure | §8.1 Silent stall | Phase 2 + Phase 3 (FR-QUEUE) | **P0** | FSM/queue recovery without manual disable/enable; related [#553](https://github.com/BiancoRoyal/node-red-contrib-modbus/issues/553) |
| [#568](https://github.com/BiancoRoyal/node-red-contrib-modbus/issues/568) | unitId vs unitid issue | §8.6 API consistency | Phase 3 (FR-API-01) | **P1** | `getActualUnitId()` accepts both keys; unit `0` safe (no `\|\|` fallback) |

### Open — out of scope for this spec

| Issue | Title | Action |
|-------|-------|--------|
| [#567](https://github.com/BiancoRoyal/node-red-contrib-modbus/issues/567) | Feature request / maintainership question | Maintainer response; not a code FR |

---

## 2. Closed but unresolved pattern (reopen or verify on release)

These were closed or staled without a verified fix in v5.45.x. Team 3 MUST add
regression tests where applicable; close/reopen on GitHub after release.

| Issue | Title | Symptom group | Spec / Phase | Notes |
|-------|-------|---------------|--------------|-------|
| [#553](https://github.com/BiancoRoyal/node-red-contrib-modbus/issues/553) | Node just "dies" silently | §8.1 Silent stall | Phase 2 + 3 | Explicitly linked from [#564](https://github.com/BiancoRoyal/node-red-contrib-modbus/issues/564) |
| [#472](https://github.com/BiancoRoyal/node-red-contrib-modbus/issues/472) | Internal state-machine corrupted | §8.1 Reconnect | Phase 2 | FSM hardening target |
| [#451](https://github.com/BiancoRoyal/node-red-contrib-modbus/issues/451) | Modbus TCP stops after days | §8.1 Silent stall | Phase 2 + 3 | Long-run timer/queue leak hypothesis |
| [#470](https://github.com/BiancoRoyal/node-red-contrib-modbus/issues/470) | node stop poll rate after 5 days | §8.1 Silent stall | Phase 2 + 3 | Same cluster as #451, #564 |
| [#416](https://github.com/BiancoRoyal/node-red-contrib-modbus/issues/416) | after modbus failure no initialize possible | §8.1 Reconnect | Phase 2 | FR-FSM-03 (`broken` → INIT) |
| [#520](https://github.com/BiancoRoyal/node-red-contrib-modbus/issues/520) | Modbus Failure On State sending | §8.1 FSM | Phase 2 | `failed` → `broken` path |
| [#544](https://github.com/BiancoRoyal/node-red-contrib-modbus/issues/544) | Modbus Serial \| Failure on State sending | §8.1 FSM | Phase 2 | Serial + FSM |
| [#428](https://github.com/BiancoRoyal/node-red-contrib-modbus/issues/428) | Modbus Failure On State sending (dup title) | §8.1 FSM | Phase 2 | Same symptom cluster |
| [#540](https://github.com/BiancoRoyal/node-red-contrib-modbus/issues/540) | Modbus-Read not working after NR 4.1.0 | §8.3 Timeout | Phase 2 | Cluster with [#569](https://github.com/BiancoRoyal/node-red-contrib-modbus/issues/569) |
| [#458](https://github.com/BiancoRoyal/node-red-contrib-modbus/issues/458) | Auto reconnect after Ethernet restore | §8.1 Reconnect | Phase 2 | Legitimate retry must work (FR-FSM-06) |
| [#436](https://github.com/BiancoRoyal/node-red-contrib-modbus/issues/436) | Flex Getter serial reconnect after redeploy | §8.1 Reconnect | Phase 2 | `closingModbus` / deploy path |
| [#493](https://github.com/BiancoRoyal/node-red-contrib-modbus/issues/493) | fsm failed state after sending | §8.1 FSM | Phase 2 + 3 | Queue + FSM |
| [#446](https://github.com/BiancoRoyal/node-red-contrib-modbus/issues/446) | Reconnect timeout RTU behind gateway | §8.1 Reconnect | Phase 2 | `reconnectTimeout` config preserved |

---

## 3. Queue / message loss cluster

| Issue | Title | Spec / Phase |
|-------|-------|--------------|
| [#549](https://github.com/BiancoRoyal/node-red-contrib-modbus/issues/549) | Queue off — multi device getter | Phase 3 FR-QUEUE |
| [#409](https://github.com/BiancoRoyal/node-red-contrib-modbus/issues/409) | Flex Getter queue reset on timeout | Phase 3 FR-QUEUE |
| [#517](https://github.com/BiancoRoyal/node-red-contrib-modbus/issues/517) | Empty msg on Modbus fail | Phase 3 / modbus-basics |
| [#487](https://github.com/BiancoRoyal/node-red-contrib-modbus/issues/487) | Disabling read node moves others to closed | Phase 2 FR-FSM-04 |

---

## 4. Modbus-spec / validation cluster

| Issue | Title | Spec / Phase |
|-------|-------|--------------|
| [#527](https://github.com/BiancoRoyal/node-red-contrib-modbus/issues/527) | Modbus read node overflow | Phase 3 FR-SPEC-02 |
| [#502](https://github.com/BiancoRoyal/node-red-contrib-modbus/issues/502) | Flex Writer exception 3 | Phase 3 FR-SPEC (partial — device-side) |
| [#552](https://github.com/BiancoRoyal/node-red-contrib-modbus/issues/552) | Write to address 0 | Verify — address 0 valid (FR-SPEC-01) |

---

## 5. API consistency (unitId / unitid)

| Issue | Title | Spec / Phase |
|-------|-------|--------------|
| [#568](https://github.com/BiancoRoyal/node-red-contrib-modbus/issues/568) | unitId vs unitid (open) | Phase 3 FR-API-01 |
| [#482](https://github.com/BiancoRoyal/node-red-contrib-modbus/issues/482) | msg.unitId → msg.unitid with keep properties | Phase 3 FR-API-01 |
| [#496](https://github.com/BiancoRoyal/node-red-contrib-modbus/issues/496) | Flex Getter not changing unitid | Phase 3 FR-API-01 |

---

## 6. Server / memory / platform (separate follow-up specs)

Not blocking Phase 2–4 client FSM work; track for subsequent capabilities.

| Issue | Title | Suggested follow-up spec |
|-------|-------|--------------------------|
| [#536](https://github.com/BiancoRoyal/node-red-contrib-modbus/issues/536) | memory leak on exception 11 | `modbus-client-memory-hardening` |
| [#548](https://github.com/BiancoRoyal/node-red-contrib-modbus/issues/548) | flex-server ECONNRESET | `modbus-server-resilience` |
| [#532](https://github.com/BiancoRoyal/node-red-contrib-modbus/issues/532) | NR crash RST-TCP server | `modbus-server-resilience` |
| [#537](https://github.com/BiancoRoyal/node-red-contrib-modbus/issues/537) | modbus-server direct write | `modbus-server-input` |
| [#560](https://github.com/BiancoRoyal/node-red-contrib-modbus/issues/560) | RTU restart in docker | platform / modbus-serial dep |
| [#551](https://github.com/BiancoRoyal/node-red-contrib-modbus/issues/551) | RTU slaves intermittent 5.45.1 | regression test from revert |

---

## 7. Release verification checklist (Team 3 GATE 2)

After implementation, comment on and close/reopen on GitHub.  **Release:** minimum **`5.46.0`** (FR-REL-01).

- [ ] [#569](https://github.com/BiancoRoyal/node-red-contrib-modbus/issues/569) — reconnect reaches `activated` on NR 4.1.x
- [ ] [#564](https://github.com/BiancoRoyal/node-red-contrib-modbus/issues/564) — no silent multi-week stall
- [ ] [#568](https://github.com/BiancoRoyal/node-red-contrib-modbus/issues/568) — both `unitId` and `unitid` accepted
- [ ] Cross-check [#553](https://github.com/BiancoRoyal/node-red-contrib-modbus/issues/553), [#472](https://github.com/BiancoRoyal/node-red-contrib-modbus/issues/472), [#451](https://github.com/BiancoRoyal/node-red-contrib-modbus/issues/451)

Reference PR [#570](https://github.com/BiancoRoyal/node-red-contrib-modbus/pull/570) if work lands there first —
this P4NR plan remains the authoritative v5 OSS spec path.

---

*Triage maintained by Team 1 (p4nr-spec-author). Update on each release candidate.*
