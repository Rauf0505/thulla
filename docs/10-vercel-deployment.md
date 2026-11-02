# Vercel deployment

The game is serverless-compatible. Room state lives in Supabase PostgreSQL, commands go through Next.js route handlers, and clients receive change signals over Supabase Realtime with a polling fallback. No custom WebSocket server or in-memory room map is required.

## 1. Environment variables

Set these in **Vercel → Project → Settings → Environment Variables** for Production (and Preview if desired):

| Variable                        | Notes                                                               |
| ------------------------------- | ------------------------------------------------------------------- |
| `DATABASE_URL`                  | Supabase **transaction pooler** connection string, port `6543`.     |
| `SUPABASE_URL`                  | `https://<project-ref>.supabase.co`. Server-only.                   |
| `SUPABASE_SERVICE_ROLE_KEY`     | Service-role secret. Server-only. Never prefix with `NEXT_PUBLIC_`. |
| `NEXT_PUBLIC_SUPABASE_URL`      | Same project URL. Public. Must exist at build time.                 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Publishable/anon key. Public. Must exist at build time.             |
| `ADMIN_BOOTSTRAP_EMAILS`        | Comma-separated Google emails that receive the admin role.          |
| `DB_MAX`                        | Optional. Defaults to `1` on Vercel, `10` elsewhere.                |

Use the transaction pooler for `DATABASE_URL` on Vercel. The app already sets `prepare: false`, which the pooler requires. Direct connections and session poolers are intended for long-lived hosts such as Docker, Railway, or a VPS.

The app pins `postgres@4`, which reserves a connection for each `sql.begin()` transaction so pipelined queries cannot leak into another transaction on the shared pooler. Keep `prepare: false`; do not set `max_pipeline: 0`. If the shared transaction pooler still misbehaves under load, use the session pooler (port `5432`) and keep `DB_MAX=1`.

If the Supabase dashboard gives you a URL ending in `?pgbouncer=true`, remove that parameter for `postgres.js`; it is a Prisma-specific flag.

## 2. Database migration

Run once from your machine, with `DATABASE_URL` pointing at the production database:

```sh
npm run db:migrate
```

The script loads `.env.local` and `.env`, records applied files in `schema_migrations`, and applies only new migrations. Vercel builds do not run migrations.

The latest migration adds `public.room_presence`, used for connection status and away-player takeover.

## 3. Supabase authentication URLs

In **Supabase → Authentication → URL Configuration**:

- **Site URL**: `https://<your-app>.vercel.app`
- **Redirect URLs**: add `https://<your-app>.vercel.app/auth/callback` and keep `http://localhost:3000/auth/callback` for local development.

In **Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client**:

- **Authorized JavaScript origins**: `https://<your-app>.vercel.app` and `http://localhost:3000`
- **Authorized redirect URIs**: `https://<project-ref>.supabase.co/auth/v1/callback`

The Google redirect URI points at Supabase, not at the Vercel app. Supabase then redirects to the app’s `/auth/callback`.

## 4. Realtime

Clients subscribe to a public channel named `room:<CODE>`. The server broadcasts only `{ code }`; each client then fetches its own private view over authenticated HTTP, so hands are never broadcast.

- Realtime is enabled by default on Supabase projects.
- If Realtime is unavailable, the client’s polling fallback still keeps games working, with slightly higher latency.
- Broadcasts use the service-role key from the server. No extra Realtime RLS policy is required for public channels.
- To reduce Realtime usage, you can leave it enabled but expect the client to poll every 10 seconds as a safety net.

## 5. Deploy

1. Import the GitHub repository in Vercel.
2. Framework preset: **Next.js**. Build command: `npm run build`. Output: default.
3. Add the environment variables above.
4. Deploy.
5. Open `/api/health`. It returns `{ "ok": true, "database": "postgres" }` when the database is reachable.

## 6. Admin bootstrap

`ADMIN_BOOTSTRAP_EMAILS` is applied lazily on the first game API request in each serverless instance. It is idempotent. After the listed account signs in with Google, reload the app; the admin link appears once the role is applied.

## 7. Operational notes

- **Presence**: a player counts as connected for 25 seconds after their last state request. A visible tab polls every 10 seconds, so it stays online. A hidden or closed tab expires; the server plays for that seat on the first request after 1.5 seconds of its next turn, or at the turn deadline if presence expired mid-turn.
- **Timers**: no background worker. The next state or command request advances expired turns and bot moves. Clients also schedule a refresh at the game deadline.
- **Concurrency**: every mutation takes a PostgreSQL row lock, so multiple Vercel instances can serve the same room safely.
- **Rate limiting**: the command route has a best-effort per-instance limiter. For stronger protection, put Vercel’s WAF or an edge rate limiter in front of `/api/game/command`.
- **Function duration**: commands are short. Default Vercel limits are sufficient.
- **Cost**: the 10-second fallback poll is the main invocation source. Increase the interval in `app/page.tsx` if you need to reduce usage; the Realtime signal and deadline timer still keep play responsive.

## Troubleshooting

| Symptom                                               | Fix                                                                                                           |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `/api/health` returns 503                             | Check `DATABASE_URL`, project status, and pooler port `6543`.                                                 |
| Google sign-in returns `redirect_uri_mismatch`        | Google’s redirect URI must be `https://<project-ref>.supabase.co/auth/v1/callback`.                           |
| Sign-in returns to the app but the session is missing | Add the Vercel callback URL to Supabase redirect URLs.                                                        |
| “Join a table first” after a reload                   | The account is not in an active room; create or join again.                                                   |
| Updates arrive only every ~10 seconds                 | Realtime broadcast is failing; check `SUPABASE_URL` and the service-role key, then check the browser console. |
| `DATABASE_URL is required` during migration           | Ensure `.env.local` exists or export `DATABASE_URL` in the shell.                                             |
| Admin link missing                                    | Sign in once, confirm the email is in `ADMIN_BOOTSTRAP_EMAILS`, then reload.                                  |
