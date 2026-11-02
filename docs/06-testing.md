# Testing and acceptance

## Verified locally — 2026-10-17

Production build and TypeScript check passed. Eleven engine tests passed, including 72 complete seeded bot games and a separate deterministic replay comparison. Chromium browser checks previously passed the responsive widths and PWA flows. The Supabase account, OAuth, migration, admin, and cloud database paths require configured project credentials for end-to-end verification. Physical devices, native installation prompts, and deployed load tests remain pending.

## Automated

`npm test`: engine fixtures cover 3–8 player deals, opening off-suit exception, mandatory following, rejection immutability, immediate Thulla, final-card pickup, old-waste draw and forced lead, simultaneous two-player finishes, drawn-lead Thulla shortcut, hand transfer, and seeded bot games. Across 72 complete games, assert 52 cards and unique ownership after every transition.

`npm run typecheck` and `npm run build` verify compilation. Browser automation checks mobile viewport overflow, waiting room and bot game flow, and eight-seat layouts. The HTTP game API’s duplicate IDs, stale versions, reconnect identity, privacy, and health checks can be exercised against a configured project. These checks do not substitute for real iOS/Android installation tests.

## Manual release gates

- Physical iOS Safari and Android Chrome: portrait/landscape, keyboard opening, installation, standalone launch, airplane-mode fallback, reconnect.
- Widths 320, 375, 390, 430, 768, 1280: no page overflow; seven opponents readable; all hand cards accessible; long names bounded; touch targets usable.
- Two human browsers: private hands differ; remote plays update; timers recover from background suspension; timeout/card race accepts one move only.
- Stop and restart server mid-trick: same room/hand restored from PostgreSQL; audit and snapshot agree; reconnect preserves seat.
- Full games, hand-taking, escaped spectators, and rematches rotate deal without leaking old private state.
- Keyboard and screen reader: suit names, feedback, rule dialog focus, selection state and legal actions.

Known operational limits: no room expiry; no rate limit across multiple sockets; no multi-instance ownership; invariant incidents require operator intervention. Keep initial hosting private until these limits are addressed. Explicit departure hands an active seat to a bot and transfers host control to another human.
