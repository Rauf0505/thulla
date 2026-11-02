# Architecture and deployment

## Components

- Next.js App Router serves the React client and PWA assets.
- `server.ts` owns one HTTP server and `/ws` WebSocket upgrade; `/api/health` returns health. Run through tsx, not `next start`.
- `src/engine.ts` is an immutable transition engine with injected randomness. Timers are server metadata and do not affect rule decisions.
- `src/bot.ts` chooses among legal cards using only its hand and public trick. No access to opponents is used in the policy.
- `src/protocol.ts` defines client-visible snapshots and command types.
- Supabase PostgreSQL stores room snapshots and an ordered action audit in one transaction before broadcast.

## Ownership and recovery

All room commands execute synchronously in one event loop, serializing mutations. Each transition clones the room. A persistence failure leaves the published in-memory room unchanged. Snapshots contain authoritative state, user IDs, dealer, version, and accepted command IDs; access tokens are never persisted. Restart reloads snapshots and resets unfinished deadlines to 30 seconds. Disconnected-seat bot takeover still applies after 1.5 seconds. Clients reconnect every 1.5 seconds using a Supabase access token. Timers resume; disconnected players receive bot moves.

The action audit records action names and versions, not complete command payloads. Recovery uses snapshots, not audit replay. Deterministic replay belongs to engine fixtures. Request IDs remain in the snapshot for room lifetime.

## Production

Build with `npm run build`, then `npm start`. The Dockerfile encapsulates this and sets NODE_ENV=production. Persist `/app/data`, terminate HTTPS at the reverse proxy, forward Upgrade/Connection headers and preserve Host. Use a single application instance and sticky ownership. Do not use serverless request-only hosting. Production readiness requires capacity limits, room/session expiry, operational alerting, and load testing before open internet promotion.

Check health and logs; monitor database connection pool usage, WebSocket connection counts, database errors, and transition failures. Use Supabase backups and migration history for recovery. Roll back code only with compatible snapshots; archive a database backup before schema/rule changes.
