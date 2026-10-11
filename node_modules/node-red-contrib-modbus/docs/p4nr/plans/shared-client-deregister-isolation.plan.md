# Plan: Shared Client Deregister Isolation (#423)

**Spec:** `shared-client-deregister-isolation`  
**Date:** 2026-07-21

## Steps

1. Add `normalizeClientUserId(x)` in `modbus-client.js`.
2. Fix `registerForModbus` / `deregisterForModbus` / `closeConnectionWithoutRegisteredNodes`.
3. Unit tests: two ids registered → deregister one → no `setStoppedState` / STOP;
   deregister last → close path.
4. CHANGELOG under Unreleased / next patch.
5. Comment on GitHub #423 after verify.
