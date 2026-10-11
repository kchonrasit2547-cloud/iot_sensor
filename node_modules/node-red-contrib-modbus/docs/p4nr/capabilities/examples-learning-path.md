# Capability Spec: Examples Learning Path

**Spec ID:** `examples-learning-path`  
**Version:** v5 OSS LTS (`node-red-contrib-modbus` 5.x)  
**Status:** DRAFT → ready for Team 2 review  
**Author:** p4nr-spec-author (Team 1)  
**Date:** 2026-07-21  
**Related:** Issue #567 (gateway pattern example only; no new palette nodes)

---

## 1. Problem Statement

The `examples/` folder ships 12 importable Node-RED flows, but they are uneven,
hard to learn from, and partly broken for new users:

- External dependency on `modbus-flex-server` (not in this package)
- Absolute host paths (`/Users/Shared/...`) instead of `extras/ioFileData/`
- Duplicate / typo’d sequencer demos; no ordered learning path
- No Modbus fundamentals flow; no serial client tutorial pattern
- Thin coverage for Flex-Connector, Flex-FC, IO-Config, Response-Filter
- Main README points at an old flows.nodered.org link, not the local library

Users need one flow per major node (and a few patterns) that teach both
**how Modbus works** and **how this package is meant to be used**.

---

## 2. Goals

1. Replace flat legacy demos with a **numbered learning path** (01–15).
2. Cover **all 14 package nodes** with at least one focused example.
3. Teach Modbus basics (memory areas, FCs, unit ID, 0-based addressing).
4. Remove external `modbus-flex-server` references from shipped examples.
5. Fix IO/CODESYS paths to use package `extras/` assets.
6. Document import via `examples/README.md` and the main README.

---

## 3. Scope

### 3.1 In-scope

| Area | Description |
|------|-------------|
| `examples/*.json` | Replace with 15 numbered flows (see §5) |
| `examples/README.md` | Learning-path index + import instructions |
| Root `README.md` | Link to local examples |
| `src/*.html` help | Short pointer to example filename for thin nodes |
| `CHANGELOG.md` | User-visible examples restructure entry |

### 3.2 Out-of-scope

- New palette nodes / Dynamic Server (#567) — separate capability
- `src/` runtime logic changes (except HTML help text)
- Bringing `modbus-flex-server` back into this package
- Hardware-dependent serial E2E in CI (serial example is educational)

---

## 4. Functional Requirements

### FR-EX-01 — Numbered library filenames

Shipped examples MUST use the filenames in §5. Node-RED Import → Examples
lists them by filename; prefixes establish order.

### FR-EX-02 — Package-only nodes

Every flow MUST use only nodes registered in this package’s
`package.json` → `node-red.nodes`. MUST NOT reference `modbus-flex-server`.

### FR-EX-03 — Self-contained TCP demos

Client↔server demos MUST use local `modbus-server` on documented ports
in the range **10502–10520** (one primary port per flow file; no cross-flow
port collisions when multiple examples are imported into one NR instance
if users follow the README port table).

### FR-EX-04 — Comment-led learning

Each flow MUST include at least one `comment` node (English) describing:
purpose, nodes used, Modbus concepts shown, and how to run the demo.

### FR-EX-05 — No absolute user paths

IO / file examples MUST reference paths under the package `extras/` tree
(or instruct the user to copy `extras/ioFileData/` to a writable location
with a relative/placeholder path documented in the comment).

### FR-EX-06 — One learning goal per file

Each JSON file SHOULD be a single tab (or clearly named tabs) for one goal.
Avoid mega-demos that mix unrelated topics.

### FR-EX-07 — Serial pattern without CI hardware

`14-Pattern-Serial-RTU-Client.json` MUST document serial client settings and
payload shapes; it MAY leave the serial port disconnected and explain that
hardware is required. MUST NOT fail package install.

### FR-EX-08 — Gateway “today” pattern

`15-Pattern-Gateway-With-Buffer-Server.json` MUST show what is possible with
the **buffer** `modbus-server` today and MUST link (comment text) to GitHub
issue #567 / separate dynamic-server package for flow-based request/response.

---

## 5. Target File List

| File | Nodes / topic |
|------|----------------|
| `01-Modbus-Basics-Registers-And-FCs.json` | Concepts + server + read/write |
| `02-Getting-Started-Client-And-Server.json` | client, server, read, response |
| `03-Node-Read-Polling.json` | modbus-read |
| `04-Node-Getter-On-Demand.json` | modbus-getter |
| `05-Node-Flex-Getter-Dynamic.json` | modbus-flex-getter |
| `06-Node-Write-And-Flex-Write.json` | write, flex-write |
| `07-Node-Flex-Sequencer.json` | flex-sequencer |
| `08-Node-Flex-FC-Custom-Maps.json` | flex-fc |
| `09-Node-Flex-Connector-Runtime-Switch.json` | flex-connector |
| `10-Node-Queue-Info-And-Multi-Device.json` | queue-info |
| `11-Node-IO-Config-And-Response-Filter.json` | io-config, response-filter |
| `12-Node-Server-Buffer-Slave.json` | modbus-server buffer inject |
| `13-Pattern-HTTP-To-Modbus.json` | HTTP → getter/write |
| `14-Pattern-Serial-RTU-Client.json` | serial client config (educational) |
| `15-Pattern-Gateway-With-Buffer-Server.json` | buffer gateway pattern + #567 pointer |

Legacy files in `examples/` MUST be removed when the new set is added (no
`_archive/` inside the published `files` list).

---

## 6. Non-Functional Requirements

- Valid Node-RED flow JSON (importable on Node-RED ≥ 4)
- Keep example JSON reasonably small (prefer &lt; 30 KB per file)
- English comments (consistent with existing package docs)

---

## 7. Acceptance Criteria

- [ ] All 15 files present; legacy 12 removed
- [ ] `grep -r modbus-flex-server examples/` returns no matches
- [ ] No `/Users/Shared` paths in `examples/`
- [ ] `examples/README.md` lists 01–15 with one-line purpose
- [ ] Root README links to `examples/README.md`
- [ ] Thin node HTML help mentions the matching example filename
- [ ] CHANGELOG entry under the next release section

---

## 8. Risks

| Risk | Mitigation |
|------|------------|
| Users bookmarked old example names | README lists old → new mapping |
| Port conflicts when importing all | Port table in examples/README |
| Serial example confuses CI users | Comment: educational only |

---

*Maintained by Team 1 (p4nr-spec-author).*
