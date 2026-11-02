# Product requirements

## Goal and audience

Bring friends who know Punjabi Getaway to a private digital table, with enough guidance for newcomers. A player signs in with Google, creates a room, shares an invitation, readies up, plays legal cards, escapes, and rematches. Phones are the primary platform.

## Release capability

Next.js web application with installable PWA; Google-authenticated accounts; 3–8 seats; private six-character room codes; bots; all selected canonical rules; server-enforced turns; 30-second turn clock; reconnect; durable recovery; host-controlled rematches; match history and statistics. Bots are ready automatically. Human readiness is required before initial start. Rematches keep seats and rotate the dealer.

The host cannot remove human players. Leaving during a match gives the seat to a bot; leaving a lobby removes the seat. Hosting passes to the next human guest. A departed guest can create or join another table. Room expiry and cleanup remain operational follow-up work.

## Success criteria

At 320px the entire page fits horizontally, every hand card remains reachable, and a legal move can be selected and confirmed by touch. A room can complete with one human and two bots. Friends can join separate contexts, receive different private hands, reconnect to their seat, and start another round. No illegal client action changes the authoritative game.

## Exclusions

Accounts, native store apps, public matchmaking, chat, rankings, payments, multiple decks, configurable household rules, and multi-instance hosting are outside this release.
