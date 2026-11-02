# Architecture and deployment

## Components

- Next.js App Router serves the React client and PWA assets.
- `app/api/game/state` and `app/api/game/command` are the transport. `/api/health` returns health. The app runs on `next start` and on serverless hosts such as Vercel.
- `src/room.ts` owns room loading, row-locked mutations, presence, timer advancement, and persistence.
- `src/engine.ts` is an immutable transition engine with injected randomness. Timers are server metadata and do not affect rule decisions.
- `src/bot.ts` chooses among legal cards using only its hand and public trick. No access to opponents is used in the policy.
- `src/protocol.ts` defines client-visible snapshots and command types.
- Supabase PostgreSQL stores room snapshots and an ordered action audit in one transaction before broadcast.

## Ownership and recovery

Each command runs in a PostgreSQL transaction that takes `SELECT … FOR UPDATE` on the room row, so concurrent instances serialize mutations. Snapshots contain authoritative state, user IDs, dealer, version, and accepted command IDs; access tokens are never persisted. Expired turns and bot moves advance lazily on the next state or command request, which makes the design safe for serverless functions. Presence lives in `room_presence`, with a 25-second window; an away seat is covered by a bot on the first request 1.5 seconds into its turn, or at the 30-second deadline if presence expires mid-turn. Clients fetch their private view over HTTP, subscribe to a Supabase Realtime `room:<code>` broadcast for change signals, and poll as a fallback. Disconnected players receive bot moves.

The action audit records action names and versions, not complete command payloads. Recovery uses snapshots, not audit replay. Deterministic replay belongs to engine fixtures. The most recent request IDs remain in the snapshot for idempotency.

## Production

Build with `npm run build`, then `npm start`. The Dockerfile encapsulates this and sets NODE_ENV=production. Vercel can host the same build; see `docs/10-vercel-deployment.md`. Terminate HTTPS at the reverse proxy. Multiple instances are safe because room mutations use database row locks. Production readiness requires capacity limits, room/session expiry, operational alerting, and load testing before open internet promotion.

Check health and logs; monitor function invocations, database connection pool usage, Realtime messages, database errors, and transition failures. Use Supabase backups and migration history for recovery. Roll back code only with compatible snapshots; archive a database backup before schema/rule changes.
