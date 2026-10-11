# Spec Review: Modbus Dynamic Server / Gateway (#567)

**Capability:** `modbus-dynamic-server-gateway`  
**Plan:** `docs/p4nr/plans/modbus-dynamic-server-gateway.plan.md`  
**Reviewer:** p4nr-spec-reviewer (Team 2)  
**Date:** 2026-07-21  
**Verdict:** **SEPARATE-PACKAGE** (not APPROVE for v5 `src/`)

---

## Checklist

| Check | Result |
|-------|--------|
| Modbus-spec compliance analysis sound | Pass |
| Adequacy gap list complete enough | Pass |
| Separate-package recommendation justified | Pass |
| No GATE 1 for implementing nodes in this repo | Pass (explicit) |
| Open Questions listed for #567 author | Pass (expected for draft) |
| v5 in-scope limited to docs + example 15 pointer | Pass |

## Findings

| Severity | Finding | Action |
|----------|---------|--------|
| Blocker (for v5 src) | Message contract not locked | Keep out of this package until separate repo + tests |
| Info | keepMsg correlation is a different v5 concern | Own tiny spec if pursued |
| Info | Existing `modbus-server` must remain buffer slave | Document in example 15 |

## Blockers for merge into v5

- Incomplete message contract / timeout / FC scope
- Support and versioning risk (flex-server precedent)

## Handoff

- **Do not** create GATE 1 APPROVE for Team 3 node implementation in this repo.
- Team 3 under `examples-learning-path` MAY ship example 15 (buffer pattern + link).
- Maintainers: comment on #567 with spec path and open questions.
