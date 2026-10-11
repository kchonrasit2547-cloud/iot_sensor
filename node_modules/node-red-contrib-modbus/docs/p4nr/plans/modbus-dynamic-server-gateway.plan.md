# Plan Draft: Modbus Dynamic Server / Gateway (#567)

**Plan ID:** `modbus-dynamic-server-gateway`  
**Capability:** `docs/p4nr/capabilities/modbus-dynamic-server-gateway.md`  
**Status:** DRAFT — **no Team 3 work in this repo**  
**Date:** 2026-07-21  

## This repository (v5)

| Task | Owner |
|------|-------|
| Keep capability draft updated | Team 1 |
| Ship example 15 (buffer gateway + pointer) | Team 3 under `examples-learning-path` APPROVE |
| Comment on GitHub #567 with contract questions | Maintainer / Team 1 |
| Optional keepMsg correlation | Separate tiny spec if needed |

## Separate package (future)

1. Scaffold `node-red-contrib-modbus-dynamic-server`
2. Lock message contract with #567 author
3. TDD: Mocha + real TCP Modbus client
4. Implement config / request / response nodes
5. Publish examples for cache, relay, FC filter
6. Cross-link from v5 README / example 15

## Explicit non-goals here

- No `src/` dynamic-server nodes in `node-red-contrib-modbus` v5
- No GATE 1 APPROVE that authorises Team 3 to add those nodes here
