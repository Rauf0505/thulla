# Thulla

A mobile-first Next.js / TypeScript implementation of Punjabi Getaway. It uses Supabase PostgreSQL, Google accounts, private rooms, bots, authoritative WebSocket play, match history, account support, admin operations, and an installable PWA.

## Run

Requires Node.js 24 and a Supabase project.

```sh
npm ci
npm run db:migrate
npm run dev
```

Copy `.env.example` to `.env.local` and supply your Supabase project values first. In Supabase Authentication, enable Google, add the Google OAuth callback URL shown by Supabase to Google Cloud, and add `http://localhost:3000/auth/callback` plus your deployed callback URL to Supabase redirect URLs. Set `ADMIN_BOOTSTRAP_EMAILS` to the first administrator’s Google email, then restart after that account signs in.

Open http://localhost:3000, sign in with Google, create a table, add two bots, mark yourself ready, and deal. Every completed bot or human match counts in account statistics.

```sh
npm test
npm run typecheck
npm run build
npm start
```

With the production server running on port 3001 (`$env:PORT='3001'; npm start` in PowerShell), run `npm run test:e2e`. Run `npm run test:integration` after a build for isolated restart/privacy/protocol checks; it creates its own server on port 3019 and temporary database.

`npm start` selects the production build. Docker also sets NODE_ENV=production. Run `docker build -t thulla .` then provide the same environment variables at runtime. Put HTTPS and WebSocket forwarding in front of the container. `/api/health` is the health endpoint. One instance owns live rooms; run a single game-server replica until distributed room coordination is added.

## Documentation

- [Product requirements](docs/01-prd.md)
- [Canonical rules](docs/02-rules.md)
- [Architecture and deployment](docs/03-architecture.md)
- [Data model and protocol](docs/04-api.md)
- [UI and accessibility](docs/05-ui.md)
- [Testing and acceptance](docs/06-testing.md)
- [Roadmap](docs/07-roadmap.md)
- [Sources and decisions](docs/08-decisions.md)
- [Supabase accounts and administration](docs/09-supabase-accounts.md)

The documentation ZIP includes the current rules, architecture, Supabase schema, and account/admin design. Never commit `.env.local` or Supabase service-role keys. The service-role key is server-only; browsers use only the public anonymous key. Use Supabase backups and run behind HTTPS in production.
