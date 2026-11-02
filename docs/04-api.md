# Data model and WebSocket protocol

## Transport

Connect same-origin `/ws` using ws locally and wss under HTTPS. Maximum incoming payload 4096 bytes, maximum 20 messages per connection per second. Cross-origin browser handshakes are rejected. Supabase access tokens are sent as `token` on each message. Never put them in invitation links. Treat them as bearer credentials; use TLS.

Guest and room operations use WebSocket commands, rather than parallel REST mutations. HTTP GET `/api/health` returns `{ "ok": true }`.

## Commands

All messages: `{type, token}`. Room mutations after joining also require `{id, version}`: a UUID request ID and the latest snapshot version.

| type | Extra fields | Behavior |
|---|---|---|
| resume | — | Restore the signed-in player's existing room |
| create | name | Create a room and host seat |
| join | name, code | Join an unstarted room with fewer than eight players |
| ready | — | Toggle own readiness before start |
| leave | — | Leave room; active match seat becomes a bot, host passes to next human |
| addBot | — | Host adds ready bot |
| removeBot | player | Host removes bot before start |
| start | — | Host starts with 3–8 ready players |
| play | card | Play a legal own card |
| take | — | Take next active hand in inter-trick window |
| rematch | — | Host starts next match after result |

Names are trimmed, nonempty, at most 24 characters. Card IDs are rank followed by S/H/C/D, e.g. AS, 10H. IDs already accepted return the current snapshot without another transition. Other stale versions return an error. Automatic transitions increment versions too.

## Responses and privacy

`{type:"state",view}` contains code, version, you, host, players, own hand, own legal cards, and public game. Public players include ID, name, bot, readiness, connection, hand count, escape status. Public game includes turn, phase, opening flag, trick number, face-up pile, loser, message, and deadline in Unix milliseconds. See `View` for exact types.

No snapshot sends another hand, waste order, access tokens, randomness, command history, or persistence payload. Even duplicate connections get only the same signed-in player's hand. Errors are `{type:"error",message}` and never serialize internal state. Reconnect resends full state, never buffered offline commands. A browser tab sharing the same token represents the same seat.
