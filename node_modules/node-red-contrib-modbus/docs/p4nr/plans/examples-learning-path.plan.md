# Implementation Plan: Examples Learning Path

**Plan ID:** `examples-learning-path`  
**Capability Spec:** `docs/p4nr/capabilities/examples-learning-path.md`  
**Target:** v5 OSS LTS  
**Status:** DRAFT  
**Author:** p4nr-spec-author (Team 1)  
**Date:** 2026-07-21  

> **GATE 1:** Team 3 MUST NOT replace `examples/` until
> `docs/p4nr/reviews/examples-learning-path-GATE1-APPROVE.md` exists.

---

## Overview

Rebuild `examples/` as a numbered curriculum (01–15), fix docs/help pointers,
remove broken paths and flex-server dependencies. No runtime `src/*.js` logic
changes required (HTML help text only).

---

## Phase 1 — Scaffold & remove legacy

1. Delete legacy `examples/*.json` (12 files).
2. Add `examples/README.md` with learning path + port table + old→new map.

## Phase 2 — Build flows 01–15

Create each flow with:

- Unique `z` tab id / flow id
- `modbus-client` + `modbus-server` where a live demo is needed (TCP `127.0.0.1`)
- Assigned port from README table
- At least one `comment` node (EN)

Reuse patterns from cleaned legacy demos where useful (HTTP, switch-tcp,
Flex-FC, buffer server) but strip flex-server and absolute paths.

## Phase 3 — Docs & help

1. Update root `README.md` examples section.
2. Add example filename pointers in HTML help for:
   Read, Getter, Write, Response, Response-Filter (and others as needed).
3. CHANGELOG entry.

## Phase 4 — Verify

```bash
grep -r 'modbus-flex-server' examples/ || true   # expect empty
grep -r '/Users/Shared' examples/ || true        # expect empty
ls examples/*.json | wc -l                       # expect 15
```

Manual: import one flow in Node-RED (optional local check).

---

## Port assignment (canonical)

| Flow | Port |
|------|------|
| 01 Basics | 10502 |
| 02 Getting Started | 10503 |
| 03 Read | 10504 |
| 04 Getter | 10505 |
| 05 Flex-Getter | 10506 |
| 06 Write | 10507 |
| 07 Sequencer | 10508 |
| 08 Flex-FC | 10509 |
| 09 Connector | 10510 / 10511 (two servers) |
| 10 Queue | 10512 |
| 11 IO | 10513 |
| 12 Server Buffer | 10514 |
| 13 HTTP | 10515 |
| 14 Serial | n/a (serial path) |
| 15 Gateway | 10516 |

---

## Definition of Done

All FR-EX-01…08 and §7 acceptance criteria from the capability spec.
