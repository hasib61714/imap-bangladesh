# IMAP 2.0 — Implementation Risk Register

**Status:** BLUEPRINT · **Phase:** 3 · **Date:** 2026-08-09

Probability and impact are for the risk **materialising during Phase 4**. Owner is who decides, not who codes.

---

## R-01 · Ledger opening balances misstate what the platform owes · **CRITICAL**

| | |
|---|---|
| **P / I** | Medium / **Critical** |
| **Detail** | `users.balance` cannot be reconstructed from `wallet_transactions`, and part of the total is the 500.00 credited free at signup — money never paid in |
| **Mitigation** | M-25 blocked until a signed decision exists; rehearse on a restored production copy; **stop condition is any imbalance at any scale**, not a tolerance; the unresolvable portion is one stated number against `platform_opening_equity`, never spread across accounts |
| **Detection** | Global and per-transaction balance assertion; nightly reconciliation for 30 days; derived vs `users.balance` compared daily |
| **Rollback** | Delete the opening transactions; `users.balance` remains authoritative until M-26 |
| **Owner** | **Business** — engineering computes the number, it does not choose the treatment |

---

## R-02 · Service-graph mapping loses a provider's regulated capability · **CRITICAL**

| | |
|---|---|
| **P / I** | **High** / **Critical** |
| **Detail** | Three taxonomies (12 / 8 / 19 entries) reconcile into one by human judgement. A silently dropped capability means a provider stops receiving work with no explanation and no metric surfaces it |
| **Mitigation** | Every source value mapped **or queued — none dropped, none guessed**; 30 providers sampled and checked by hand against their profile text; legacy columns retained a full release cycle |
| **Detection** | **Stop condition: >5% queued, or any provider loses a capability they previously advertised**; two weeks of daily drift comparison against the legacy columns |
| **Rollback** | Truncate the new tables; legacy columns still populated |
| **Owner** | Product + operations |

---

## R-03 · Identity migration loses a principal or locks a user out · **HIGH**

| | |
|---|---|
| **P / I** | Medium / **Critical** |
| **Mitigation** | Count assertions; **7-day dual-write with a nightly diff**; verified snapshot; credential rules rehearsed against production-shaped data; orphan providers listed for human review, never guessed |
| **Detection** | Nightly diff `users` vs `principal`; login success rate after cutover |
| **Rollback** | M-13 switches reads back; `users` still authoritative |
| **Owner** | Engineering |

---

## R-04 · Global logout at cutover reads as an outage · **HIGH**

| | |
|---|---|
| **P / I** | **High** / Medium |
| **Detail** | `JWT_SECRET` rotation is *intended* — it is `CREDENTIAL-INCIDENT.md` §3 step 4. Every user is logged out simultaneously |
| **Mitigation** | **Communicate before the release**; schedule at the lowest-traffic hour; in-app copy explaining why |
| **Detection** | Support volume; login rate |
| **Rollback** | None — and none is wanted. The rotation is the point |
| **Owner** | Project owner (communication) |

---

## R-05 · Payment history or gateway linkage broken · **HIGH**

| | |
|---|---|
| **P / I** | Low / **Critical** |
| **Mitigation** | **No financial row deleted at Gate 1**; `gateway_ref` carried onto `payment` so the link to the gateway's own record survives; legacy tables read-only for a cycle before M-33 |
| **Detection** | Daily gateway-settlement reconciliation, **reported in both directions** |
| **Rollback** | Legacy tables intact until M-33 |
| **Owner** | Engineering |

---

## R-06 · `App.jsx` migration stalls half-done · **HIGH**

| | |
|---|---|
| **P / I** | Medium / **High** |
| **Detail** | 5,567 lines; the most commonly abandoned kind of work |
| **Mitigation** | **Structural, not motivational** — Step 0 deletes 34% immediately, Step 1 adds routing, and every subsequent step ships independently. **There is no point at which stopping leaves the product worse than it started** |
| **Detection** | Step completion; remaining line count |
| **Rollback** | Per step |
| **Owner** | Engineering |

---

## R-07 · Fabricated-data fallback is reintroduced · **HIGH**

| | |
|---|---|
| **P / I** | Medium / **High** |
| **Detail** | The defining defect. Every list loader is `if (d?.x?.length) setX(...)`, so empty, failed and expired all render as fabricated rows |
| **Mitigation** | `constants/data.js` **deleted**; lint rule forbidding object-array exports under `features/`; every surface requires a real empty state before it merges |
| **Detection** | CI lint; per-surface empty-state test |
| **Rollback** | n/a — prevention |
| **Owner** | Engineering |

---

## R-08 · Identity documents lost when base64 columns are nulled · **HIGH**

| | |
|---|---|
| **P / I** | Low / **Critical** |
| **Detail** | M-15 deletes the only other copy of regulated personal data |
| **Mitigation** | **M-14 and M-15 separated by a full release cycle**; **every object fetched back and byte-compared** before M-15; verified snapshot |
| **Detection** | Byte comparison; signed-URL retrieval test on every case |
| **Rollback** | **Snapshot only** — this is genuinely irreversible |
| **Owner** | Engineering |

---

## R-09 · Availability data is discarded and providers do not re-enter it · **MEDIUM**

| | |
|---|---|
| **P / I** | **High** / Medium |
| **Detail** | `provider_schedule` is deliberately not migrated — its dateless free-text slots encode the double-booking defect |
| **Mitigation** | **Communicate before the release**; availability editable in under 30 seconds by design (R-905); prompt at first login |
| **Detection** | Providers with zero availability windows after 7 days |
| **Rollback** | The old table survives one cycle |
| **Owner** | Product (communication) |

---

## R-10 · Production migration behaves differently on TiDB · **MEDIUM**

| | |
|---|---|
| **P / I** | Medium / **High** |
| **Detail** | The rehearsal ran on MariaDB 12.2 against **17 empty tables**. It says nothing about TiDB DDL semantics, error codes, or timing at production row counts |
| **Mitigation** | Rehearse on a restored production copy; **measure, never extrapolate**; one migration per deploy at HIGH+; verified snapshot |
| **Detection** | `--status` before each run; validation SQL after |
| **Rollback** | Snapshot restore |
| **Owner** | Engineering |
| **Note** | **This is `PHASE-3-READINESS.md` §5.1, still open** |

---

## R-11 · Separation of duties unenforceable at Gate 1 · **MEDIUM**

| | |
|---|---|
| **P / I** | **Certain** / Medium |
| **Detail** | Four Gate-1 roles, one `admin`, one person. The approver of a refund *is* the executor of the payout |
| **Mitigation** | Policies written against the six platform roles from the first commit; single admin granted all six; **tightening is a membership change, not a code change**; **the same-actor path writes an audit record flagged `sod_bypass`** |
| **Detection** | Count of `sod_bypass` records |
| **Rollback** | n/a — accepted, with a compensating control |
| **Owner** | Project owner — enforcement switches on when a second operator exists |

---

## R-12 · Backup unverified when a production migration runs · **HIGH**

| | |
|---|---|
| **P / I** | Medium / **Critical** |
| **Detail** | Four vendor assumptions are unverified. **Until they are checked, IMAP does not know whether it has a backup** |
| **Mitigation** | **No production migration until §5.2 is closed**; one full restore drill; verified means restorable, not "the call returned success" |
| **Detection** | Console verification; drill result |
| **Rollback** | n/a |
| **Owner** | Project owner |
| **Note** | **`PHASE-3-READINESS.md` §5.2, still open** |

---

## R-13 · Legacy behaviour reintroduced during a rewrite · **MEDIUM**

| | |
|---|---|
| **P / I** | Medium / **High** |
| **Detail** | Twelve P0 fixes live in code being rewritten |
| **Mitigation** | **Every P0 has a regression test that fails if the fix is reverted** (`CRITICAL-TEST-MATRIX.md` §12); the full suite runs on every task, not just the new tests |
| **Detection** | CI |
| **Rollback** | Revert the task |
| **Owner** | Engineering |

---

## R-14 · Realtime blocked for a segment of users · **MEDIUM**

| | |
|---|---|
| **P / I** | Medium / Medium |
| **Detail** | Corporate networks and some Bangladeshi mobile operators block WebSocket upgrades |
| **Mitigation** | **Polling fallback is a Gate-1 requirement, not an enhancement**; state marked "as of" a time |
| **Detection** | Socket connection failure rate by network |
| **Owner** | Engineering |

---

## R-15 · Bundle budget exceeded, core loop unusable on target devices · **MEDIUM**

| | |
|---|---|
| **P / I** | Medium / **High** |
| **Detail** | ~540 KB today against a 150 KB budget; the target device is a 2 GB Android on 3G |
| **Mitigation** | Build fails on an entry that exceeds its budget; **Ant Design confined to a separate entry and asserted absent from the consumer bundle**; no component library adopted; map lazy-loaded |
| **Detection** | CI budget check; RUM after launch |
| **Owner** | Engineering |

---

## R-16 · Scope creep into Gate 2 · **MEDIUM**

| | |
|---|---|
| **P / I** | **High** / Medium |
| **Detail** | The Phase 2 architecture is roughly twice Gate-1 size and is fully specified — every deferred item has a document describing how to build it |
| **Mitigation** | `GATE-1-ARCHITECTURE.md` is frozen (AD-026); **not listed ⇒ DEFER**; every task names its forbidden files; **0 AI tools is an absolute** |
| **Detection** | Task scope review; entity, event and endpoint counts against the frozen numbers |
| **Owner** | Project owner |

---

## R-17 · Emergency surface claims a capability IMAP lacks · **HIGH**

| | |
|---|---|
| **P / I** | Low / **Critical** |
| **Detail** | The worst outcome this system can produce: a person in danger acting on a false "help is on the way" |
| **Mitigation** | Capability statement served as **data**, not copy, so behaviour and text cannot drift; **no `dispatched` state exists anywhere**; the response reports **actual** admin reachability; **any failure surfaces the hotline** |
| **Detection** | Matrix rows 71–78; E2E on the failure path specifically |
| **Owner** | Product |
| **Open** | **Hotline numbers are still unverified (R-1009)** — carried since Phase 0.5 |

---

## R-18 · Audit log grows unmanageably or leaks sensitive data · **MEDIUM**

| | |
|---|---|
| **P / I** | Medium / Medium |
| **Mitigation** | **Changed fields only** — passing a whole row throws; field denylist per privacy class; monthly partitions pruned by partition drop; daily cold export |
| **Detection** | Table growth monitoring — **a spike almost always means someone started logging whole rows** |
| **Owner** | Engineering |

---

## R-19 · Commission rate never set; the platform earns nothing · **MEDIUM**

| | |
|---|---|
| **P / I** | Medium / **High** |
| **Detail** | D-009 is unresolved. `PLATFORM_FEE_PCT` defaults to 0 and **stays** at 0 |
| **Mitigation** | Zero is a working, tested configuration producing no commission entries — launch is not blocked, only revenue |
| **Detection** | Explicit in the Gate-1 exit criteria |
| **Owner** | **Business** |

---

## R-20 · Development environment still points at production · **CRITICAL**

| | |
|---|---|
| **P / I** | **Certain today** / **Critical** |
| **Detail** | `backend/.env` still names the production TiDB host |
| **Mitigation** | **Already contained** — the application refuses to start (Phase 2.75, verified). The remaining exposure is credential presence on the workstation, not accidental use |
| **Detection** | Startup guard fires |
| **Rollback** | n/a |
| **Owner** | **Project owner** — rotate and repoint |
| **Note** | Blocks *everything*: no local development is possible until it is fixed |

---

## Summary

| Severity | Risks |
|---|---|
| **CRITICAL** | R-01 ledger opening balances · R-02 capability loss · R-20 dev-on-production |
| **HIGH** | R-03 identity migration · R-04 global logout · R-05 payment history · R-06 frontend stall · R-07 fabricated data · R-08 document loss · R-12 unverified backup · R-17 emergency claim |
| **MEDIUM** | R-09 · R-10 · R-11 · R-13 · R-14 · R-15 · R-16 · R-18 · R-19 |

### By owner

| Owner | Risks |
|---|---|
| **Business** | R-01, R-19 |
| **Product** | R-02, R-09, R-17 |
| **Project owner** | R-04, R-11, R-12, R-16, R-20 |
| **Engineering** | R-03, R-05, R-06, R-07, R-08, R-10, R-13, R-14, R-15, R-18 |

**Eight of twenty are not engineering risks.** The two rated CRITICAL alongside R-20 — opening balances and capability loss — are both human-judgement problems where the engineering mitigation is to *stop and ask*, not to be more careful.
