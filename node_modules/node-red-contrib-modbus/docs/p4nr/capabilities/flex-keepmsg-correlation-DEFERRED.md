# Deferred: Flex keepMsg / correlation passthrough

**Spec ID:** `flex-keepmsg-correlation` (deferred)  
**Status:** DEFERRED — no GATE 1 for `src/` in this delivery  
**Date:** 2026-07-21  
**Related:** #567 plumbing note, #550, #482, #568  

## Why deferred

Issue #567 mentioned Flex-Getter not preserving all input `msg` properties,
which hurts request↔response correlation when using the client as a relay.

For the **examples-learning-path** delivery we:

- Document **Keep Msg Properties** in Flex examples (`keepMsgProperties: true`)
- Rely on **5.46.0** `unitId` / `unitid` + `Number.isInteger` handling (#568)
- Do **not** change Flex-Getter/Write runtime without a dedicated capability
  APPROVE (backwards-compat risk; keep-msg hotfix was previously reverted)

## When to reopen

If reporters on #550 / #567 still lose custom correlation fields with
`keepMsgProperties` enabled on **5.46.0+**, open a focused capability with
failing Mocha tests before any `src/` change.
