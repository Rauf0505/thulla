# Data model and HTTP protocol

## Transport

All game traffic uses authenticated same-origin HTTP under `/api/game`. The browser sends the Supabase access token as `Authorization: Bearer <token>`; never put it in invitation links. Treat it as a bearer credential and use TLS.

- `GET /api/game/state?code=ABC123` returns the signed-in player's private view, or `{ "view": null }` when they are not in that room. With no `code`, it resumes the player's current room.
- `POST /api/game/command` applies one room command.
- `GET /api/health` returns `{ "ok": true, "database": "postgres" }` when the database is reachable.

Every mutating request runs in a PostgreSQL transaction with a row lock on the room. Automatic transitions (expired turns, bot moves, trick advances) run lazily before the command and before each state response, so serverless instances do not need a background worker.

Change notifications are best-effort: after a committed change the server broadcasts `{ "code": "ABC123" }` on the Supabase Realtime public channel `room:ABC123`. Clients treat it only as a signal and fetch their own private view. Polling every 10 seconds and a timer at the game deadline are the fallback.

## Commands

Body: `{type, id, version?, code?, ...extra}`. `id` is a UUID request ID. Room mutations after create/join also send the latest snapshot `version` and the current `code`; a stale version returns `409` with `{ "error": "Table updated. Please try again." }`.

| type      | Extra fields | Behavior                                                               |
| --------- | ------------ | ---------------------------------------------------------------------- |
| resume    | —            | Restore the signed-in player's existing room                           |
| create    | name         | Create a room and host seat                                            |
| join      | name, code   | Join an unstarted room with fewer than eight players                   |
| ready     | —            | Toggle own readiness before start                                      |
| leave     | —            | Leave room; active match seat becomes a bot, host passes to next human |
| addBot    | —            | Host adds ready bot                                                    |
| removeBot | player       | Host removes bot before start                                          |
| start     | —            | Host starts with 3–8 ready players                                     |
| play      | card         | Play a legal own card                                                  |
| take      | —            | Take next active hand in inter-trick window                            |
| rematch   | —            | Host starts next match after result                                    |

Names are trimmed, nonempty, at most 24 characters. Card IDs are rank followed by S/H/C/D, e.g. AS, 10H. IDs already accepted return the current snapshot without another transition. Other stale versions return an error. Automatic transitions increment versions too.

Successful responses are `{ "view": View }` or `{ "left": true }`. Errors use a non-2xx status and `{ "error": "message" }`, and never serialize internal state.

## Responses and privacy

`View` contains code, version, you, host, players, own hand, own legal cards, and public game. Public players include ID, name, bot, readiness, connection, hand count, escape status. Public game includes turn, phase, opening flag, trick number, face-up pile, loser, message, and deadline in Unix milliseconds. See `src/protocol.ts` for exact types.

No view sends another hand, waste order, access tokens, randomness, command history, or persistence payload. Two browser tabs sharing the same token represent the same seat. A hidden or closed tab stops refreshing presence; the seat is covered by a bot on the first request after 1.5 seconds of its next turn, or at the turn deadline if presence expires mid-turn.

## Persistence

Supabase PostgreSQL stores room snapshots (`rooms.snapshot`), an ordered command audit (`room_events`), presence (`room_presence`), match history (`matches`, `match_players`), statistics (`player_stats`, `player_stat_ledger`), account requests, and admin audit records. `room_events.command_id` is unique per room, so duplicate request IDs are idempotent.
