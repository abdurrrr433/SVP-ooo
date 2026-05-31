# SVP Booking System: Endpoints & Test Center Resolution

## Overview

The booking system uses a proxied SVP API with **25 key endpoints**. All proxy paths are relative to:
- **Node backend**: `/svp`
- **Supabase Edge Functions**: `/functions/v1/svp-proxy`

---

## Test Center Resolution Flow

### Problem Solved
Previously, sessions with a nested `test_center.id` equal to the exam session ID were incorrectly treated as test center IDs, displaying random numbers instead of proper center names.

### Current Resolution Strategy

```
Session → test_center payload:
  ├─ If test_center.test_center_id exists → use it ✓
  ├─ Else if test_center.id exists AND != session.id → use it ✓
  ├─ Else if candidateName exists → lookup by name ✓
  ├─ Else if test_center_id matches Bangladesh static centers → use static data ✓
  ├─ Else → synthesize "City Center" or "City (Site #<id>)" ✓
  └─ Cache result by session.id for ~session lifetime
```

### Bangladesh Static Centers (Fallback)
When SVP returns `null` for center names, these 18 real centers are auto-resolved:

| site_id | name | city |
|---------|-------|------|
| 17 | Bangladesh Korea TTC Dhaka | Dhaka |
| 45 | Bangladesh German TTC | Dhaka |
| 54 | Rajshahi Technical Training Centre | Rajshahi |
| 71 | Sylhet Technical Training Center | Sylhet |
| 62 | Cumilla Technical Training Centre | Cumilla |
| 107 | Bogura Technical Training Centre | Rajshahi |
| 115 | BRTC Central Training Institute Gazipur | Dhaka |
| 156 | Khulna Technical Training Centre | Khulna |
| 168 | Chapainawabganj Technical Training Centre | Rajshahi |
| 171 | Jashore Technical Training Centre | Khulna |
| 181 | Narail Technical Training Centre | Khulna |
| 201 | Pabna Technical Training Centre | Rajshahi |
| 203 | Noakhali Technical Training Centre | Cumilla |
| 218 | Narsingdi Technical Training Center | Dhaka |
| 220 | Kishoreganj Technical Training Centre | Dhaka |
| 221 | Shariatpur Technical Training Centre | Dhaka |
| 223 | Manikganj Technical Training Center | Dhaka |
| 265 | Joypurhat Technical Training Center | Rajshahi |

---

## Available Dates & City Filtering

### Flow
```
1. GET /available-dates (filters by occupation, category, methodology)
   ↓ Response: [ { city: "Dhaka", date: "2025-06-15" }, { city: "Rajshahi", date: "2025-06-20" }, ... ]

2. User selects city → GET /exam-sessions?city=Dhaka&exam_date=2025-06-15&...
   ↓ Response: [ session { id, test_center: { id, name, site_id, city }, available_seats }, ... ]

3. Proxy enriches each session with:
   - Full test_center detail (name, site_id, address)
   - Resolved real center name from static map or DB
   - Live available_seats count

4. Frontend renders:
   ┌─────────────────────────────────────────┐
   │ Test Center Dropdown                    │
   │ ─────────────────────────────────────── │
   │ ○ Bangladesh Korea TTC Dhaka (Dhaka)   │
   │ ○ Bangladesh German TTC (Dhaka)         │
   │ ○ BRTC Central Training Institute... (D)│
   │ ○ Sylhet Technical Training Center      │
   └─────────────────────────────────────────┘
   (NOT: "Dhaka (Site #1554463)")
```

---

## SVP Proxy Endpoints Reference

| # | Method | Proxy Path | Upstream | Purpose |
|----|--------|------------|----------|---------|
| 1 | GET | `/permissions` | `/api/v1/individual_labor_space/permissions` | Current user's allowed actions |
| 2 | GET | `/occupations` | `/api/v1/individual_labor_space/occupations` | List of exam categories & languages |
| 3 | GET | `/exam-constraints` | `/api/v1/individual_labor_space/exam_constraints` | Per-occupation booking rules |
| 4 | GET | `/available-dates` | `/api/v1/individual_labor_space/exam_sessions/available_dates` | Dates with ≥1 open seat (with fallbacks) |
| 5 | GET | `/exam-sessions` | `/api/v1/individual_labor_space/exam_sessions` | List sessions by city/date/category (enriched) |
| 6 | GET | `/exam-session/:id` | `/api/v1/individual_labor_space/exam_sessions/:id` | Single session detail (enriched) |
| 7 | GET | `/exam-reservations` | `/api/v1/individual_labor_space/exam_reservations` | User's past & current reservations |
| 8 | GET | `/exam-reservations/:id` | `/api/v1/individual_labor_space/exam_reservations/:id` | Single reservation detail |
| 9 | POST | `/temporary-seats` | `/api/v1/individual_labor_space/temporary_seats` | Hold seat for ~10 min (optional) |
| 10 | POST | `/exam-reservations` | `/api/v1/individual_labor_space/exam_reservations` | Confirm new reservation |
| 11 | DELETE | `/exam-reservations/:id` | `/api/v1/individual_labor_space/exam_reservations/:id` | Cancel reservation |
| 12 | POST | `/exam-reservations/:id/reschedule` | `/api/v1/individual_labor_space/exam_reservations/:id/reschedule` | Move to new session |
| 13 | POST | `/reservation-credits/use` | `/api/v1/individual_labor_space/reservation_credits/use` | Consume prepaid credit |
| 14 | GET | `/certificate-price` | `/api/v1/individual_labor_space/certificate_price` | Price lookup (dynamic) |
| 15 | GET | `/payments-validate-pending` | `/api/v1/individual_labor_space/payments/validate_pending` | Check unfinished payments |
| 16 | POST | `/payments` | `/api/v1/individual_labor_space/payments` | Create payment intent |
| 17 | GET | `/payments/:id` | `/api/v1/individual_labor_space/payments/:id` | Payment status/details |
| 18 | PUT | `/payments/:id` | `/api/v1/individual_labor_space/payments/:id` | Finalize/update payment |
| 19 | GET | `/feature-flags` | `/api/v1/individual_labor_space/feature_flags` | Server feature toggles |
| 20 | GET | `/notifications` | `/api/v1/individual_labor_space/notifications` | User notifications log |
| 21 | GET | `/user-balance` | `/api/v1/users/:id/balance` or `/individual_labor_space/user_balance/:id` | Wallet balance (auto-resolves user) |
| 22 | GET | `/user-balance/:userId` | `/api/v1/individual_labor_space/user_balance/:userId` | Wallet balance (explicit user) |
| 23 | GET | `/tickets/:reservationId/show-pdf` | `/api/v1/individual_labor_space/tickets/:id/show_pdf` | PDF ticket (binary stream) |
| 24 | GET | `/test-centers` | `/api/v1/individual_labor_space/test_centers` | All centers with filters |
| 25 | GET | `/test-centers/:id` | `/api/v1/individual_labor_space/test_centers/:id` | Single center detail |

---

## Key Enhancements

### Session Enrichment (Endpoints 5 & 6)
The proxy automatically enriches session payloads with:
- **Real test_center.name** from SVP API detail → DB lookup → static Bangladesh map
- **site_id resolution** with fallback chain
- **available_seats** count extracted from response payload
- **Prometric codes** (language options) normalized

### Error Handling
- **404 fallbacks**: `/available-dates` tries 3 upstream paths
- **Timeout resilience**: Session detail lookup fails gracefully; uses candidate session data
- **Null-safe resolution**: Every center ID extraction uses positive number validation

### Caching Strategy
- Session center resolution cached in memory by `session.id`
- Cache lifespan: transaction session lifetime (auto-cleared on new request)
- No disk/Redis dependency; keeps resolution logic lean

---

## Booking Page Integration

### Session Dropdown Population
```typescript
// From BookingPage.tsx
const centerOptions = useMemo(() => {
  const options = buildCenterOptions(cityFilteredSessions);
  // Enrich with real test center names from proxy response
  return options.map((opt) => ({
    ...opt,
    name: testCenterMap.get(opt.siteId) || opt.name,
  }));
}, [cityFilteredSessions, testCenterMap]);
```

### Reservation Submission
```typescript
const requestSiteId = (() => {
  if (resolvedSession?.test_center?.site_id) return Number(resolvedSession.test_center.site_id);
  if (resolvedSession?.site_id) return Number(resolvedSession.site_id);
  if (siteId) return Number(siteId);
  return null;
})();

// POST /exam-reservations
{
  exam_session_id: Number(sessionId),
  occupation_id: Number(selectedOccupationId),
  methodology: "in_person",
  language_code: "prometric_code",
  site_id: requestSiteId,
  site_city: requestSiteCity,
  hold_id: holdId ? Number(holdId) : null,
}
```

---

## Status: System Testing Ready

✅ **Test Center ID Resolution**: Fixed nested ID collision  
✅ **Center Name Mapping**: Static Bangladesh centers + live DB lookup  
✅ **Available Dates & City**: Properly filtered and displayed  
✅ **Seat Availability**: Live lookup during session detail fetch  
✅ **Reservation Submission**: Passes resolved site_id + site_city  

Ready for integration testing and live booking flow validation.
