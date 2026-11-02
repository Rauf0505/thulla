# Thulla

A mobile-first Next.js / TypeScript implementation of Punjabi Getaway. It uses Supabase PostgreSQL, Google accounts, private rooms, bots, authoritative server-side play, match history, account support, admin operations, and an installable PWA.

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

`npm start` runs the production Next.js build. The optional Playwright suite (`npm run test:e2e`) expects a running app with Google authentication configured and a signed-in session; it is not part of `npm test`.

## Deploy to Vercel

This app is serverless-compatible: game state lives in Supabase PostgreSQL, commands go through `/api/game/*`, and clients receive Supabase Realtime broadcast signals with a polling fallback. There is no custom WebSocket server to host.

1. Import the GitHub repository in Vercel. The framework preset is **Next.js**; keep the default build (`npm run build`).
2. Add the environment variables from `.env.example` in **Project → Settings → Environment Variables**. `NEXT_PUBLIC_*` values must be present at build time.
3. Use the **transaction pooler** connection string (port `6543`) for `DATABASE_URL` on Vercel. Direct connections and session poolers are for long-lived hosts.
4. Run `npm run db:migrate` once from your machine against the production database. Vercel builds do not run migrations.
5. Add `https://<your-app>.vercel.app/auth/callback` to **Supabase → Authentication → URL Configuration → Redirect URLs**, and add the same host to Google’s authorized JavaScript origins.
6. Deploy. Check `/api/health`; it returns `{ "ok": true }` when the database is reachable.

See [docs/10-vercel-deployment.md](docs/10-vercel-deployment.md) for the full checklist, including Realtime and admin bootstrap notes.

## Docker / VPS

The included Dockerfile still works for long-lived hosts:

```sh
docker build -t thulla .
docker run --env-file .env.local -p 3000:3000 thulla
```

Use the **session pooler** connection string (port `5432`) for `DATABASE_URL` on IPv4-only hosts, or the direct connection if the host has IPv6 (or the Supabase project has the IPv4 add-on). Put HTTPS in front of the container. `/api/health` is the health endpoint. Multiple instances are safe because room mutations take a PostgreSQL row lock; there is no in-memory room ownership.

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
- [Vercel deployment](docs/10-vercel-deployment.md)

Never commit `.env.local` or Supabase service-role keys. The service-role key is server-only; browsers use only the public anonymous/publishable key. Use Supabase backups and run behind HTTPS in production.
