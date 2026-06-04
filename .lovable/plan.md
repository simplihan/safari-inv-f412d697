# Pulse Safari – Implementation Plan

This is a large request (10+ feature areas). I'll ship it in **5 phases** so each is reviewable, testable, and doesn't sit half-broken. Phase 1 covers everything blocking users *right now*; later phases add the deeper modules.

Before I start, two quick questions inline (answer in chat or just say "go with defaults"):

1. **Auto-stop timeout** — your spec says both "120 minutes" (Activity Management) and "60 minutes" (Acceptance Criteria). I'll use **120 min** unless you say otherwise.
2. **Notifications to admins on new access requests** — in-app bell + browser notification only, or also email? I'll do in-app + browser (email needs an email-domain setup turn).

---

## Phase 1 — Rebrand + Critical Fixes (this turn)

Goal: fix everything blocking users today.

- **Rebrand "Pulse Inv" → "Pulse Safari"** everywhere (sidebar, login, register, headers, browser title, device gate, footer).
- **Register / Access Request fix**: department dropdown made searchable (Command combobox), client-side required-field validation, clearer success toast. Confirm the existing `handle_new_user` trigger still creates the pending profile.
- **Chat fixes**:
  - Sticky chat header (`sticky top-0` inside the scroll container).
  - Hide chat nav item + redirect away from `/app/chat` when `dept_chat_settings.enabled = false` for non-admin/manager (already partly wired; fix the redirect + the realtime refresh so it applies without reload).
  - Unread counter badge on the Chat sidebar item (count messages where `recipient_id = me AND read_at IS NULL`, live via realtime).
  - Fix desktop notification trigger (request permission on first chat open; fire on new message when tab not focused and `notif_enabled`).
- **Notifications default on**: `profiles.notif_enabled` already defaults `true` — verify and backfill any NULLs.

## Phase 2 — Activity Locking + Auto-Stop

- DB: partial unique index on `break_logs(user_id) WHERE status = 'out'` so a user can have at most one open activity. Friendly error mapped in `friendly-error.ts`: *"Please stop your current activity before starting a new one."*
- Auto-stop: there's already an `auto_close_stale_breaks()` function (2h). Wire it to `pg_cron` to run every 5 min, and append `Auto Timeout` to remarks. Add `audit_logs` table entry on auto-close.
- Admin controls on `/app/monitoring`: Start / Stop / Edit / Reassign buttons (server fn with `requireSupabaseAuth` + admin role check).

## Phase 3 — User Management + Roles

- Extend `app_role` enum with `supervisor` (currently: admin, manager, staff).
- Staff page: add **Activate/Deactivate** toggle (uses existing `status` column), **Reset password** (admin server fn → `supabaseAdmin.auth.admin.updateUserById`), **Assign manager** field on profile (`manager_id uuid references profiles`).
- Manual add user already exists via `adminCreateUser`; expose role + manager selection in the dialog.

## Phase 4 — Retention + Reports + Audit

- `audit_logs` table (actor, action, entity, entity_id, payload, created_at). Triggers on `profiles`, `break_logs`, `messages`, `departments`.
- Daily `pg_cron` job: purge `break_logs`, `messages`, `login_events`, `audit_logs` older than 90 days. Storage-usage card on admin dashboard via `pg_database_size`.
- Email reports: scaffold transactional email (Lovable Emails). Server fn renders a report (date range, totals, dept stats) and queues email to the user's manager / admin.
- PDF/Excel export buttons on Reports page (client-side with `jspdf` + `xlsx`).

## Phase 5 — Dashboard widgets + Notification Center

- New admin dashboard cards: Active Users, Active Activities, Idle Users, Auto-Stopped count, Pending Requests, Storage Usage, Recent Logs.
- Charts: dept comparison bar, activity heatmap (recharts).
- `/app/notifications` bell with realtime feed sourced from `audit_logs` + chat unread + access requests.

---

## Out of scope / pushback

- **"Database Management Module" (CRUD on arbitrary tables from the dashboard)** — building a generic admin DB editor is a multi-week project and is much better served by the Backend tab in Lovable Cloud, which already gives admins SQL + table editing with audit. I'll add a **"View Backend"** button on the admin dashboard instead. If you really want an in-app table editor, we can scope it as its own follow-up.
- **WebSockets** — Supabase Realtime is already used; no separate WS server needed.
- **Email scheduled delivery** — depends on email domain setup; I'll add the on-demand "Send report" first, scheduled delivery once email infra is verified.

---

## Technical notes (skip if non-technical)

- All new tables get RLS + GRANT in the same migration, per project memory.
- Server mutations go through `createServerFn` + `requireSupabaseAuth`; admin-only ones check `has_role(auth.uid(), 'admin')` inside the handler.
- Friendly-error map extended for the new unique-violation on active activity.
- `friendlyError` already wraps all toast errors — keep that pattern.

---

**Approve this and I'll start Phase 1 immediately.** Each subsequent phase ships in its own turn so you can verify as we go.
