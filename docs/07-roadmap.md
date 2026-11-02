# Implementation roadmap

1. Responsive foundation: lobby, cards, table, bounded opponent seats, horizontal hand, small-screen CSS. Gate: viewport layout automation before live browser flow validation.
2. Canonical engine: fixed rules, immutable transitions, legal moves, controlled randomness, full seeded games. Gate: fixtures and conservation tests.
3. Authoritative multiplayer: authenticated room commands, readiness, bots, idempotency, private views, PostgreSQL transactions, recovery. Gate: protocol integration and reconnect testing.
4. Complete user flow: invitations, play confirmation, timers, hand-taking, results, rematch, PWA assets and offline page. Gate: browser game flow and production build.
5. Release verification: physical devices, screen-reader audit, deployment backup/restore, capacity limits and operational monitoring. These checks require target hardware and a hosting environment; do not mark them complete from desktop automation alone.

Next operational work: room/session expiry; bounded deduplication storage; per-IP connection throttling; metrics/alerts; storage retention policy; staged deployment and load testing. Native apps and public matchmaking remain separate product decisions.
