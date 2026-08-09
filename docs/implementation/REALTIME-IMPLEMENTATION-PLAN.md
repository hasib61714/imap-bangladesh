# IMAP 2.0 — Realtime Implementation Plan (Gate 1)

**Status:** BLUEPRINT · **Phase:** 3 · **Date:** 2026-08-09
**Governed by:** `REALTIME-ARCHITECTURE.md` · AD-013 · `AUTHORIZATION-IMPLEMENTATION-PLAN.md` §7

---

## 1. Starting position

`backend/realtime.js` (Phase 0.5, 131 lines) is **already the target design**: rooms are joined only after DB-verified participation, admin membership is verified against the database rather than a token claim, and `socket.authorizedBookings` is a server-held set.

Two defects remain, both on the client: `socket.js` and `hooks/useSocket.js` are independent singletons that both connect with the same token, so every user opens **two connections**.

| Component | Disposition |
|---|---|
| `backend/realtime.js` | **KEEP+REFACTOR** → `src/transport/realtime/` |
| `frontend/src/socket.js` + `hooks/useSocket.js` | **REWRITE (merge)** → `src/shared/realtime/` — one client |

---

## 2. The rule everything else follows

> **No client-supplied room id is ever treated as authorization.**

A client asks to join `booking:<id>`. The server loads the booking, checks participation through the authorization kernel, and **only then** records membership. The room name is a request, never a claim. This is the P0-7 fix, generalised: membership is recorded *after* a permit, not before.

---

## 3. Channels

| Channel | Room name | Who may join | Who may publish | Payload | Lifecycle |
|---|---|---|---|---|---|
| **Booking** | `booking:<id>` | `booking.observe` — customer, assigned provider, ops | **server only** | state, ETA, message notice | Join on open; leave on close; **auto-leave when the booking reaches a terminal state** |
| **Provider location** | `booking:<id>` (same room, separate event) | as above | **assigned provider only**, and only while state ∈ {active, arrived} | `{lat, lng, at}` | **Window closes on `arrived` → `awaiting_confirmation`** |
| **Provider inbox** | `provider:<account_id>` | that provider's members | server only | new request, cancellation | Join on connect if a provider membership exists |
| **Customer inbox** | `principal:<id>` | self only | server only | booking state changes | Join on connect |
| **Ops** | `role:ops` | **DB-verified platform role** | server only | emergency, dispute, payment anomaly | Join on connect after a DB check |

**Five channels. No global broadcast exists** — the P0-8 defect was an SOS alert reaching every connected socket.

---

## 4. Authorization at three points

| Point | Check |
|---|---|
| **Connect** | Token verified; principal loaded **from the database**; `socket.actor` built. An invalid token connects as anonymous — it does not fail silently and then behave as authenticated |
| **Join** | `authorize(actor, 'booking.observe', bookingRef)`. On permit, and only then, `socket.join()` and the id is added to `socket.authorizedRooms` |
| **Publish** | Every inbound event re-checks `socket.authorizedRooms`. **A room the socket never joined cannot be published to**, even if the client names it correctly |

```js
socket.on('location_update', async ({ bookingId, lat, lng }) => {
  if (!socket.authorizedRooms.has(`booking:${bookingId}`)) return drop('not_joined');
  const b = await bookings.get(bookingId);
  if (b.provider_account_id !== socket.actor.account_id) return drop('not_provider');
  if (!['active','arrived'].includes(b.state))            return drop('window_closed');
  io.to(`booking:${bookingId}`).emit('location', { lat, lng, at: now() });
});
```

`drop()` logs with the actor and the reason and returns nothing to the client. A socket learns nothing about what it was denied — the same non-enumeration rule as `404`/`403`.

---

## 5. Server-authoritative emission — the Gate-1 change

Today, route handlers emit directly after a state change. That means a client can be told about a change that later rolls back.

**Target: emission is driven by the outbox**, in the same order as the events.

```
state change + audit + outbox   [one transaction]
        ↓ commit
    dispatcher
        ↓
  realtime emitter → io.to(room).emit(...)
```

| Property | Consequence |
|---|---|
| Nothing is emitted for an uncommitted change | The rollback-visible-to-client class of bug disappears |
| Emission order matches event order per aggregate | Two rapid transitions cannot arrive reversed |
| **Persist, then emit** — never emit-only | A missed socket message is recoverable by reading state; an emit-only message is lost |
| Realtime is an accelerant | Every surface it serves is also reachable by polling (`SYSTEM-ARCHITECTURE.md` §6.4) |

---

## 6. Lifecycle

| Situation | Behaviour |
|---|---|
| Connect | Token verified; principal from DB; join `principal:<id>`, plus `provider:<id>` and `role:ops` where the membership exists |
| Join a booking room | Authorized per §4; recorded server-side |
| Booking reaches terminal state | **Server forces every socket out of the room.** A completed booking has no live channel |
| Disconnect | All membership discarded; nothing cached in-process about the socket |
| Reconnect | **Rooms are re-authorized from scratch.** Prior membership is never restored from the client's word |
| Token expires mid-connection | Next inbound event fails authorization; socket downgraded to anonymous, client told to re-authenticate |
| Client disconnected | Banner; **polling fallback for the active booking**; state marked "as of" a time |

Reconnect re-authorization matters: a provider suspended while connected must lose access on reconnect, not keep a live channel because their old socket said so.

---

## 7. Privacy

| Data | Rule |
|---|---|
| Precise location | **Only** between `active` and `arrived`, **only** in that booking's room, **only** to the customer and ops. Never persisted beyond the booking (D-04) |
| Message content | Delivered in-room; **body never appears in a log line or an audit payload** — the audit records conversation id and length |
| Emergency payload | `emergency.raised` reaches `role:ops` with **`has_location: true`**, never coordinates. Full detail is fetched through the audited HTTP path |
| Provider identity | Only to a booking participant. `GET /providers/{id}` remains phone-free (P1-1) |
| Presence | **Not implemented.** "Online now" reveals a provider's working pattern for no product benefit at Gate 1 |

---

## 8. Audit

Realtime is high-volume; auditing every frame would make the log unusable.

| Audited | Not audited |
|---|---|
| Ops-room join (who can see emergencies) | Ordinary booking-room joins |
| **Every authorization denial** | Successful location frames |
| Location window open and close (purpose, duration) | Individual coordinates |
| Emergency emission to ops | Presence, typing |

Denials are audited because an attempt to join a room you are not a participant of is exactly the signal worth having.

---

## 9. Scaling

| | Gate 1 | Trigger to change |
|---|---|---|
| Instances | 1 | — |
| Adapter | in-memory | **>1 instance** → Redis adapter (AD-013) |
| Sticky sessions | n/a | required with >1 instance |
| Connection cap | monitored | 5,000 concurrent |

The Redis adapter is a configuration change, not a redesign — provided nothing keeps per-socket state outside the socket. `socket.authorizedRooms` is per-socket and therefore safe; **`utils/cache.js`'s in-process `Map` is not**, and is replaced by Redis in the same phase (R-1107).

---

## 10. Build order

| # | Step | Exit criterion |
|---|---|---|
| **RT-1** | Move `realtime.js` → `transport/realtime/`; authorize through the kernel | P0-7 and P0-8 tests pass unchanged |
| **RT-2** | Merge the two frontend clients into one | **one connection per user**, asserted |
| **RT-3** | Outbox-driven emission; remove direct emits from handlers | no emit for an uncommitted change |
| **RT-4** | Terminal-state room eviction | a completed booking's room is empty |
| **RT-5** | Reconnect re-authorization | a suspended provider loses access on reconnect |
| **RT-6** | Polling fallback + "as of" marker | core loop usable with sockets blocked |
| **RT-7** | Denial auditing + metrics | join denials visible |

**RT-6 is not optional.** Corporate networks and some Bangladeshi mobile operators block WebSocket upgrades; a booking that cannot be tracked without a socket is a booking that cannot be tracked.

---

## 11. Tests

| # | Test | Status |
|---|---|---|
| 1 | A non-participant cannot join a booking room | **exists** (P0-7) |
| 2 | A participant joins only their own booking | **exists** |
| 3 | A tokenless socket joins nothing | **exists** |
| 4 | `location_update` from an unauthorized socket is dropped | **exists** |
| 5 | Only the assigned provider may publish a location | **exists** |
| 6 | Only a DB-verified admin joins the ops room | **exists** (P0-8) |
| 7 | An SOS alert goes to the ops room, never to all sockets | **exists** (P0-8) |
| 8 | Location outside `active`/`arrived` is dropped | new |
| 9 | Terminal state evicts every socket | new |
| 10 | Reconnect re-authorizes; a revoked membership loses access | new |
| 11 | No emission for a rolled-back transaction | new |
| 12 | Per-aggregate emission order is preserved | new |
| 13 | One connection per user | new (frontend) |
| 14 | Denied over HTTP ⇒ denied over socket (transport parity) | new |

Tests 1–7 already pass and are the reason `realtime.js` is a refactor rather than a rewrite. Tests 8–14 are the Gate-1 additions.
