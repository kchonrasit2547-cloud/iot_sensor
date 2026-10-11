# Review: queue-sequential-drain-rearm

**Spec:** `docs/p4nr/capabilities/queue-sequential-drain-rearm.md`  
**Plan:** `docs/p4nr/plans/queue-sequential-drain-rearm.plan.md`  
**Date:** 2026-07-22  
**Reviewer:** p4nr-spec-reviewer (Team 2)

## Verdict: **APPROVE**

### Checklist

| Criterion | Result |
|-----------|--------|
| Root cause identified (#574 / FR-QUEUE-02 shift + no re-arm) | Pass |
| Fix scoped to activateSending re-arm (+ optional validation unlock) | Pass |
| Push-time dedupe retained (no unbounded unitSendingAllowed) | Pass |
| Backwards compatible (no API/palette break) | Pass |
| Blind-spot tests specified (N>1 sequential drain) | Pass |
| No TLS / v6 / registry scope creep | Pass |
| Patch release 5.50.1 appropriate | Pass |
| Security (no new attack surface) | Pass |

### Findings

- F-01 (info): FR-QSDR-04 validation unlock is correctly secondary; do not block #574 on it if time-boxed, but implement if small.
- F-02 (info): Update CHANGELOG to name 5.46.0 regression explicitly so operators know to upgrade past 5.50.0.

### Notes

- Do not revert maxQueueDepth.
- Dedup-on-push test must stay; add re-arm tests so the mistaken “never more than one entry ever” reading cannot regress again.

**GATE 1: APPROVE — Team 3 may implement in `src/` + `test/`.**
