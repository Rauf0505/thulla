# Supabase accounts and administration

## Required project setup

1. Create a Supabase project and put its pooled PostgreSQL `DATABASE_URL`, project URL, public anonymous key, and service-role key in `.env.local`.
2. Run `npm run db:migrate` to create the application schema. This is idempotent and records applied migrations in `public.schema_migrations`.
3. Enable Google in Supabase Auth. In Google Cloud add the Supabase Google callback URL as an authorized redirect URI; in Supabase add local and production `/auth/callback` URLs as allowed redirects.
4. Set `ADMIN_BOOTSTRAP_EMAILS` to a comma-separated list of initial Google account emails. After those users have first signed in, a server restart assigns them the admin role.

## Data safety

Only the server receives `SUPABASE_SERVICE_ROLE_KEY` and `DATABASE_URL`. The browser receives only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Row-level security restricts direct browser reads to the signed-in player’s profile, statistics, and account requests. Game snapshots and card hands are delivered by the authoritative server only.

## Statistics and corrections

Finished games insert match participants and a stat-ledger row in one database transaction. Bot games count. The current totals table is updated from the ledger. Administrators can add win/loss corrections only with a reason; every change is kept in `admin_audit_log`. They cannot erase historical match results through the panel.

## Operations

The `/account` page provides profile edits, match history, statistics, data-export/deletion/privacy requests, recovery, and appeals. `/admin` requires an `admin` or `moderator` role and provides account status changes, corrections, open-request review, and audit history. Suspending an account blocks new game API actions on the next request.
