# Test review checklist (PR)

Use for changes under `test/` in node-red-contrib-modbus v5 OSS.

## Live vs theatre

Three layers:

1. **Core / sinon** (`test/core/`) — no Node-RED deploy
2. **Helper unit** (`test/units/`, some `test/e2e/`) — real `helper.load`, often stubs or status-only
3. **Live Modbus** (`test/integrations/`) — `helper` + ephemeral `Modbus-Server` + `waitForModbusClientActive` + assert `msg.payload`

For production-shaped bugs (queue drain, shared client), prefer **layer 3**.
Run: `npm run test:integrations` and `npx mocha './test/e2e/modbus-tcp-live-e2e-test.js'`.

**Do not** leave real TCP E2E cases as `it.skip` / `#test-debt-e2e`. Fix ports + waits instead.
Serial hardware stays out of CI; TCP covers the Modbus stack.

## Behaviour

- [ ] Asserts **production code** (module under test), not local stub objects never wired in
- [ ] Test name describes observable behaviour, not line number / coverage target
- [ ] Failure would indicate a real regression

## Async / Node-RED helper

- [ ] Every `helper.load(..., callback)` test calls `done()` or returns a Promise inside the callback
- [ ] No fire-and-forget `helper.load` in sync `it()` without `done`
- [ ] Prefer `setImmediate` / events over `setTimeout(..., 800+)` when only deferring post-load work

## Sinon

- [ ] Use `sinon.createSandbox()` + `afterEach(() => sandbox.restore())` in core tests
- [ ] Do **not** assign `moduleExport.fn = sinon.stub()` — use `sandbox.stub(moduleExport, 'fn')`
- [ ] Fake timers via `useFakeTimers()` from `test/helper/test-helper-extensions.js` (`shouldClearNativeTimers: true`)

## Flow fixtures

- [ ] Run `validateFlowFixture(flow)` before `helper.load` when using exported flows
- [ ] `modbus-io-config.path` must be empty, missing, or a **file** path (never a directory like `test/`)
- [ ] Nodes with `ioFile` must reference an existing `modbus-io-config` id in the same flow

## Hygiene

- [ ] No `console.log` left in tests
- [ ] Do not comment out failing tests — fix, `it.skip('… #issue')`, or delete with justification
- [ ] No duplicate `.restore()` on the same stub

## Coverage

- [ ] Branch gaps: prefer behaviour tests over stub theatre
- [ ] User-visible changes: CHANGELOG entry
