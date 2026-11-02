# Sources and decisions

Reviewed 2026-10-17.

- Pagat Getaway: https://www.pagat.com/inflation/getaway.html — selected baseline, especially opening discard, retaining power, hand-taking and two-player endings.
- Bhabhi variants: https://bhabhi.asia/variants — household variations exist; not runtime-selectable in v1.
- Next.js custom server: https://nextjs.org/docs/app/guides/custom-server — persistent Node server required by chosen WebSocket architecture; no standalone output mode.

## Confirmed choices

User selected full project specification and implementation, Pagat baseline, TypeScript server, private rooms plus bots, installable PWA instead of native apps, automatic takeover, English classic table, then Next.js throughout with mobile responsiveness first.

## Digital adaptations

Strict clockwise opening; reject illegal actions rather than penalties; fixed five-second hand-taking window; 30-second turns; server serialization and state versions; Supabase access-token authentication; no client randomness. Basic bot plays low legal same-suit cards and sheds high off-suit cards. It does not inspect opponents' hands.

## Implementation defaults and deviations

WebSocket commands serve authenticated room operations; HTTP exposes account/admin APIs, health, and Next pages. Supabase PostgreSQL stores snapshots, events, match history, statistics, requests, and audit records. Manual device installation/accessibility and production capacity review remain unverified until performed. Fonts have system fallbacks when the optional Google Fonts request is unavailable.
