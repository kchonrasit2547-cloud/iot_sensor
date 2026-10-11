# Review: Repo Quality & FSM Hardening

**Review-ID:** `repo-quality-and-fsm-hardening`  
**Reviewer:** p4nr-spec-reviewer (Team 2)  
**Datum:** 2026-06-13  
**Verdict:** ✅ **APPROVE**

---

## Geprüfte Dokumente

| Dokument | Pfad | Status |
|----------|------|--------|
| Capability Spec | `docs/p4nr/capabilities/repo-quality-and-fsm-hardening.md` | Vollständig |
| Implementation Plan | `docs/p4nr/plans/repo-quality-and-fsm-hardening.plan.md` | Vollständig |

---

## Checklist (v5 OSS Mandate)

| # | Kriterium | Ergebnis | Details |
|---|-----------|----------|---------|
| ✅ | Backwards compatibility explizit adressiert | PASS | Spec §7 vollständig; `msg.payload.*` Vertrag unverändert; `maxQueueDepth` additiv mit Default 100 |
| ✅ | CHANGELOG-Impact in Plan enthalten | PASS | Spec §11 liefert 7 fertige Conventional-Commit-Einträge; Plan Task 4.8 enthält CHANGELOG-Schritt |
| ✅ | Server-Node-Impact bedacht | PASS | Non-Goal §4 explizit: Server bleibt im Paket; Task 4.4 refaktoriert `modbus-server-core.js` |
| ✅ | Kein v6-Scope-Leak | PASS | Scope §3.2 listet TLS, Server-Split, winston, Scoped-Package explizit als Out-of-Scope |
| ✅ | Mocha + test-helper Testpfade konkret | PASS | Alle 4 Testdateien mit konkreten `it()`-Snippets angegeben |
| ✅ | Open Questions leer | PASS | Kein „Open Questions"-Abschnitt vorhanden; keine ungelösten Punkte |

---

## Findings-Tabelle

| ID | Schwere | Bereich | Befund | Empfehlung |
|----|---------|---------|--------|------------|
| F-01 | Minor | Plan Task 3.1 | Testkommentar `// valid` für `FC16 quantity 124` ist irreführend — 124 überschreitet das Limit (max 123), der Test ist korrekt, der Kommentar nicht. | Team 3: Kommentar vor Commit entfernen. Kein Blocker. |
| F-02 | Minor | Plan Task 3.4 | Pseudocode verwendet `reject(new Error(...))`, aber die API-Signatur von `pushToQueueByUnitId` nutzt `cberr`. Inkonsistente Benennung im Pseudocode. | Team 3: In echter Implementierung konsistent `cberr` verwenden. Kein Blocker. |
| F-03 | Minor | Plan Task 4.8 | Befehl `npm run changelog` ist in `CLAUDE.md`/`package.json` nicht als gesichertes Script gelistet. | Team 3: Script-Existenz in Task 1.1 prüfen; fallback auf manuelles CHANGELOG-Editing. Kein Blocker. |
| F-04 | Minor | Plan Task 4.4 | Namespace-Refaktor von `modbus-server-core.js`, `modbus-io-core.js`, `modbus-basics.js` ohne explizite `it()`-Snippets (nur „Same pattern"). | Team 3: Analog zu Task 4.1 vorgehen; `modbus-server-test.js` nach Refaktor ausführen. Kein Blocker. |
| F-05 | Info | Spec §12 | `maxQueueDepth` als neue Config-Option erfordert HTML + Locale-Änderung, explizit als „separate minor spec or addendum" aufgeschoben. Nutzer können die Option bis dahin nicht per UI setzen. | Akzeptiert; per node-config-JSON oder programmatisch nutzbar. Separater Spec-Ticket empfohlen nach Phase 4. |
| F-06 | Info | Spec §8 | GitHub-Issue-Nummern fehlen (Team 1 hatte keinen `gh`-Zugang). | Team 3: Task 1.3 mit `gh issue list` manuell ausführen; keine Plan-Blockade. |

---

## Detailliertes Assessment

### FSM Hardening (FR-FSM-01 bis FR-FSM-05)

Die fünf FSM-Requirements sind präzise, mit Pseudocode und Testsnippets hinterlegt.  
FR-FSM-03 (`broken` → INIT statt ACTIVATE bei `reconnectOnTimeout=false`) ist eine
**beobachtbare Verhaltensänderung**. Die Spec begründet sie korrekt als Bug-Fix: Der Knoten
war nicht wirklich verbunden, als er `activated` signalisierte. Die CHANGELOG-Pflicht ist
notiert. **Akzeptiert.**

### Queue Hardening (FR-QUEUE-01 bis FR-QUEUE-03)

Queue-Depth-Cap mit Default 100 und `unitSendingAllowed`-Dedup sind gut spezifiziert.
FR-QUEUE-03 (Lazy Init) lässt Implementierungsfreiheit mit Dokumentationspflicht — das ist
explizit und korrekt. Kein Blocker.

### Modbus-Spec Compliance (FR-SPEC-01 bis FR-SPEC-04)

Adress- und Quantitätsgrenzen exakt nach Modbus Application Protocol V1.1b3 §6.x.
FC5-Coil-Mapping mit expliziter Behandlung von `"0"`-String (JavaScript-Tücke) korrekt
erkannt. FR-SPEC-04 (Unit-ID-Kommentarpflicht) ist ein Low-Impact-Requirement mit
niedrigem Implementierungsaufwand.

### Security (FR-SEC-01, FR-SEC-02)

Prototype-Pollution-Guard mit Denylist (`__proto__`, `constructor`, `prototype`) in
`setNewNodeSettings` ist ein wichtiger Security-Fix. Implementierungsskizze ist klar.
Payload-Sanitisierung (FR-SEC-01) ist durch die Validierungsfunktion aus FR-SPEC-01/02
abgedeckt.

### Code Quality (FR-CODE-01 bis FR-CODE-05)

CommonJS-Namespace-Refaktor ist der risikoreichste Teil (12 Module, alle abhängig von
Export-Shape). Der Plan adressiert dies korrekt durch strikte Phase-4-Reihenfolge (4.1 →
4.2 → 4.3 → 4.4), mit `npm run build && npm test` nach jedem Schritt. Das FC-Dispatch-Map
in Task 4.5 ist vollständig ausgearbeitet (inkl. `_deformedReadEnabled`-Varianten).

### Test-Gates (400+ Tests)

| Gate | Bedingung | Spezifiziert? |
|------|-----------|---------------|
| Phase 1 | `npm test` exits 0 (Baseline) | ✅ |
| Phase 2 | AC-03, AC-07 + 532 Blocks grün | ✅ |
| Phase 3 | AC-04, AC-05, AC-06 + istanbul ≤ 17 | ✅ |
| Phase 4 | AC-08, AC-09, AC-10 + istanbul ≤ 5 | ✅ |

Die Diskrepanz zwischen Spec §10.3 (sagt „≤ 5 nach Phase 3") und Plan Phase-3-DoD (sagt „≤ 17")
ist intern widersprüchlich, aber im Kontext eindeutig: Phase 3 reduziert, Phase 4 finalisiert.
Team 3 folgt dem Plan-DoD, das ist ausreichend präzise.

### Rückwärtskompatibilität — zusammengefasst

| Änderung | Breaking? | Dokumentiert? |
|----------|-----------|---------------|
| `msg.payload.*` Vertrag | Nein | n/a |
| Striktere Adress-/Quantity-Validierung | Bug-Fix (kein API-Break) | ✅ CHANGELOG |
| `maxQueueDepth` (additiv, Default 100) | Nein | ✅ Spec §7 |
| FSM broken→INIT statt ACTIVATE | Verhaltensänderung, gerechtfertigt | ✅ Plan Task 2.3 |
| Namespace-Refaktor | Intern, gleiche Export-Namen | ✅ Non-Goal §4 |
| FC5 String-"0"-Guard | Bug-Fix | ✅ CHANGELOG |

---

## Verdict

> **✅ APPROVE**

Alle Pflichtkriterien der Team-2-Checklist sind erfüllt. Die sechs Findings sind Minor/Info
und blockieren nicht. Die Spec und der Plan sind für einen v5-OSS-LTS-Scope
außergewöhnlich vollständig — Problem, Scope, FRs, Acceptance Criteria, Risikotabelle,
Test-Strategie, und CHANGELOG-Einträge alle enthalten.

**Team 3 (p4nr-developer) darf mit Task 1.1 beginnen** (nach Human GATE 1).

**Human GATE 1:** ✅ APPROVED 2026-06-13 — siehe `repo-quality-and-fsm-hardening-GATE1-APPROVE.md`

---

## Hinweise an Team 3

1. **F-01:** Kommentar `// valid` in Task 3.1 Testzeile für FC16 quantity 124 vor Commit korrigieren → entfernen oder zu `// must be rejected (max is 123)` ändern.
2. **F-02:** `pushToQueueByUnitId`-Implementierung: `cberr` statt `reject` verwenden (Pseudocode war ungenau).
3. **F-03:** In Task 1.1 prüfen: `npm run changelog` existiert? Fallback: CHANGELOG.md manuell editieren.
4. **F-04:** Task 4.4 (server-core, io-core, basics): nach jedem Modul `npm run build && npm test` ausführen und Modbus-Server-Tests explizit kontrollieren.
5. **F-06:** Task 1.3 per `gh issue list` manuell durchführen; Issue-Mapping optional dokumentieren.
6. `maxQueueDepth`-HTML ist out-of-scope für diesen Plan — Backend-only-Implementierung ist korrekt; User kann Config per JSON setzen.

---

## Handoff

```
APPROVE → Human GATE 1 → p4nr-developer (Team 3) → beginne bei Task 1.1
REJECT  → (nicht zutreffend)
```

---

*Review abgeschlossen: 2026-06-13 — p4nr-spec-reviewer (Team 2)*
