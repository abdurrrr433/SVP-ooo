# PRD — Exam Booking & Access Control System

## Original Problem Statement
SVP (svp-international.pacc.sa) exam booking system for Bangladesh test centers, plus an internal Access Control panel (ADMIN/AGENCY/USER roles). Latest evolution (June 2026): user requested (a) auto-booking + seat alert (removed after probing), (b) accurate test-center → session filtering (proven technically impossible upstream — implemented Honest Hybrid UI), (c) Supabase project migration to new instance `mziyrhutfmtdczggemhe`.

## Architecture
- **Frontend**: React + Vite + TypeScript + Tailwind/shadcn, served on port 3000 (`yarn start` = `vite --host 0.0.0.0 --port 3000`, `allowedHosts: true`).
- **Backend**: Supabase edge functions at https://mziyrhutfmtdczggemhe.supabase.co/functions/v1/
  - `svp-auth` (SVP login/OTP/refresh), `svp-proxy` (SVP REST proxy), `access-auth` / `access-admin` / `access-agency` (internal accounts).
  - Sources in /app/frontend/supabase/functions/.
  - All deployed via Supabase CLI (`supabase functions deploy ...`) Jun 23 2026.
- **FastAPI** (/app/backend): unused boilerplate (only /api/status).
- **Routes**: `/` → /access/login. Access pages: /access/dashboard|accounts|users|agencies. SVP exam pages (need SVP token): /dashboard, /exam/booking, /exam/test-center-available, /exam/test-center-browse, /exam/reservations. SVP login (/auth/login) only reachable as Access role USER.

## SVP API Limitation (CRITICAL — proven Jun 23 2026)
SVP **intentionally hides test_center identity pre-booking**:
- `/exam_sessions` list: returns `test_center: { city: "X", test_center_id: null, site_id: null, name: "X Center" }` — no real identity.
- `/exam_sessions/:id` detail: same null values.
- Hidden filter params (`?test_center_id`, `?site_id`, `?filter[...]`, nested routes) — **all ignored**, baseline count unchanged.
- 6 sessions for same city+date+category are **byte-identical except encrypted id**. No time field, no slot, no center info.
- **Hold response** returns numeric session_id but no test_center.
- **Draft reservation POST** creates a reservation but is immediately invisible to GET (404), and **triggers 11-minute account cooldown** ("try again in 11 minutes"). Real test_center_id only reveals AFTER payment.
- Conclusion: Same behavior as SVP's own UI — center is assigned at booking, not selectable beforehand.

## Implemented (Honest Hybrid UI — Jun 23 2026)
- ❌ Auto-Booking system fully removed (`BookingPage.tsx`): state, function, useEffect, panel JSX, URL param `?autobook=1` consumer.
- ❌ Fake "Test Center" filter dropdown removed from both `BookingPage.tsx` and `TestCenterAvailablePage.tsx` (it was creating one fake center per session because session.id was used as fallback key).
- ✅ Added "About Test Center Selection" info note (data-testid `test-center-info-note`) explaining SVP assigns center post-booking.
- ✅ Sessions list rendered directly (occupation → city → date → session).
- ✅ Existing CityCentersPanel (informational — real centers in city) retained.
- ✅ Reschedule dialog Center field now resolves from selected session via `resolveCenterDisplayName()`.
- ✅ Tests: all 21 vitest tests pass (including 3 integration tests that verify `/test-centers/:id` enrichment is still called and session option text includes resolved center name).

## Supabase Migration (Jun 23 2026)
- Old project: `llwquxmlsdmdtmmktqqe` (still active, unused by frontend).
- New project: `mziyrhutfmtdczggemhe` — fully bootstrapped:
  - 5 edge functions deployed via Supabase CLI (svp-auth, svp-proxy, access-auth, access-admin, access-agency).
  - 7 SQL migrations applied (accounts, test_centers, svp_users, svp_sessions, password_reset_tokens, RLS, enums).
  - 35 test_centers rows migrated from old project (36 total now).
  - Admin user seeded: admin@example.com / 12345678 (bcrypt cost 10) via Management API.
  - Verified live: ADMIN login → dashboard renders correctly.

## Live SVP Verification (still valid)
- VERIFIED LIVE on old project: login → OTP → tokens → /occupations → /available-dates → /exam-sessions → /temporary-seats → /exam-reservations (draft).
- Behavior identical on new project (same SVP upstream).

## Credentials
- See /app/memory/test_credentials.md
- Access ADMIN: admin@example.com / 12345678
- SVP: mdrahadulislamsvp55445@yopmail.com / aRrazzak90# (OTP each login)
- Supabase CLI access token: sbp_b758ec1ce7036d0d5f820195c3e14514ac3c61ac

## Backlog / Next
- P0: End-to-end live test of Honest Hybrid booking flow on new Supabase project (ADMIN → ACCESS_USER → SVP login → booking → reservation confirm).
- P1: An Access USER-role account for full browser login path testing (currently only ADMIN seeded).
- P1: Payment flow (POST /payments) to finalize reservations — requires real money + gateway.
- P2: Optional React Router v7 future flags to silence console warnings.
- P2: Decide fate of unused FastAPI backend (keep as health endpoint or migrate sensitive logic).
- P2: Migrate password_reset email integration if user wants password-reset flow live.
