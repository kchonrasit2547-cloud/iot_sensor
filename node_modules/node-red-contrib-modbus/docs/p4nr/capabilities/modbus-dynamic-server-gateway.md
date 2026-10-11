# Capability Spec (Draft): Modbus Dynamic Server / Gateway

**Spec ID:** `modbus-dynamic-server-gateway`  
**Version:** Draft for community / separate package (NOT v5 implementation)  
**Status:** DRAFT — **not approved for merge into `node-red-contrib-modbus` v5**  
**Author:** p4nr-spec-author (Team 1)  
**Date:** 2026-07-21  
**GitHub:** [#567](https://github.com/BiancoRoyal/node-red-contrib-modbus/issues/567)  
**Proposer:** @wz2b  

---

## 1. Problem Statement

Users building **smart Modbus gateways** need a flow-based TCP server that:

1. Emits each inbound Modbus request into the Node-RED flow as a friendly object
2. Accepts a corresponding response message from the flow
3. Optionally relays, caches, filters, or mediates before answering

The in-package `modbus-server` is a **buffer-backed slave** (jsmodbus register
maps + optional inject). It exposes a `request` output but does **not** allow
the flow to craft the protocol response. That is insufficient for gateway /
protocol-mediation patterns.

Issue #567 proposes three nodes (config + dynamic-request + dynamic-response),
similar in spirit to flex-getter / flex-write.

---

## 2. Modbus Specification Compliance

The design is **conformant** with Modbus Application Protocol / Modbus TCP if:

| Requirement | Spec basis |
|-------------|------------|
| Response MBAP Transaction-ID, Protocol-ID, Unit-ID match the request | Modbus Messaging on TCP/IP |
| PDU function code and byte counts match the FC definition | Application Protocol V1.1b3 |
| Rejections use **exception responses** (FC \| 0x80 + exception code) | §6 exception codes |
| Flow timeout → defined exception (e.g. 0x0B Gateway Target Device Failed to Respond) or orderly close | Operational; prefer 0x0B over silent drop |
| Gateway/relay hops remain valid Modbus on each side | Allowed; not a protocol violation |
| Optional in-order responses per TCP connection | Application policy; TCP Modbus correlates via Transaction-ID |

**Non-goals that would violate or confuse the spec:**

- Inventing non-Modbus PDUs on the Modbus TCP port
- Answering with wrong Transaction-ID
- Dropping requests without exception when a client expects a PDU

---

## 3. Adequacy of #567 for Implementation

**Verdict: architecture is clear; message contract is not sufficient to code.**

Missing for a functional v1:

1. Exact `msg` schema for request and response (property names, types)
2. Correlation key (`transactionId` + `connectionId` / socket id)
3. Timeout ms and default exception code
4. FC coverage for v1 (recommend FC1–6, 15, 16 only)
5. Behaviour with multiple outstanding requests
6. Bind / ACL / unit allowlist security defaults
7. Relationship to existing `modbus-server` (replace vs coexist)
8. Mocha acceptance tests with a real Modbus TCP client

**Related but separate (v5 client package):** Flex-Getter not preserving all
input `msg` properties breaks request↔response correlation when using the
client as a relay. Track as keepMsg / passthrough (issues #550, #482, #568);
do **not** block the dynamic-server package on that fix.

---

## 4. Recommended Delivery Vehicle

| Option | Decision |
|--------|----------|
| Merge into `node-red-contrib-modbus` v5 | **No** — scope, support burden, precedent of flex-server split |
| Separate package (e.g. `node-red-contrib-modbus-dynamic-server`) | **Yes** — preferred |
| Document “what works today” in v5 examples | **Yes** — `15-Pattern-Gateway-With-Buffer-Server.json` |

Same rationale as `node-red-contrib-modbus-flex-server` extraction.

---

## 5. Proposed Node Set (separate package)

| Node | Role |
|------|------|
| `modbus-dynamic-server-config` | jsmodbus (or equivalent) TCP listen; connection table |
| `modbus-dynamic-server` | Output: one msg per inbound request |
| `modbus-dynamic-response` | Input: response msg; writes PDU back on matching connection |

Optional config: `responseTimeout`, `enforceInOrder`, `allowedFunctionCodes`.

### 5.1 Draft message contract (to be confirmed with #567 author)

**Request (server → flow):**

```json
{
  "payload": {
    "fc": 3,
    "address": 0,
    "quantity": 2,
    "unitId": 1,
    "value": null
  },
  "modbus": {
    "transactionId": 12,
    "protocolId": 0,
    "connectionId": "conn-1",
    "remoteAddress": "192.168.1.10"
  },
  "_msgid": "..."
}
```

**Response (flow → response node):** MUST echo `modbus.transactionId` and
`modbus.connectionId`; `payload` holds register/coil data or
`payload.exceptionCode`.

---

## 6. Acceptance Tests (for the separate package)

1. FC3 read → flow returns two registers → client receives correct PDU
2. Unknown FC → exception 0x01
3. No flow response within timeout → exception 0x0B
4. Two outstanding requests, out-of-order flow replies → correct Transaction-IDs
5. Optional in-order mode does not emit response N+1 before N
6. Relay: flow uses `modbus-flex-getter` toward upstream and returns data

---

## 7. In-scope for *this* repo (v5)

- This draft capability document
- Example `15-Pattern-Gateway-With-Buffer-Server.json` (buffer only)
- Issue #567 follow-up comment linking here and listing contract questions
- Optional later: keepMsg passthrough hardening (own APPROVE)

## 8. Out-of-scope for v5

- Implementing the three dynamic-server nodes in this repository
- TLS Modbus server (v6)

---

## 9. Open Questions for @wz2b / implementers

1. Confirm request/response `msg` property names (draft §5.1)?
2. Default `responseTimeout` (ms)?
3. v1 FC list?
4. Fork URL or PR with Mocha tests?
5. Prefer exception 0x0B vs closing the socket on flow timeout?

---

*Draft only — Team 2 marks as SEPARATE-PACKAGE / not GATE-1 for v5 src.*
