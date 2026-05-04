# CCTNS Route Fix Plan

## Issues from User Feedback

### 1. UI Layout Problem
- **Current**: The 3 tabs (Latest Records, Database Gateway, Sync History) are below the date range + "Fetch & Sync to DB" section
- **Expected**: Tabs should be at the TOP of the CCTNS section, with tab-specific content below
- **Current**: Date range picker is always visible even when on Database Gateway tab (confusing)
- **Expected**: Date range + Fetch button should ONLY appear on the "Latest Records" tab

### 2. Database Gateway Shows No Data
- Dashboard shows data but Database Gateway shows "No records match your filters"
- Root cause: The `syncedQuery` has `enabled: activeTab === 'synced'` but may not be triggering properly
- The backend `/api/cctns` endpoint exists and works (used by dashboard)
- Need to verify the response structure matches what frontend expects

### 3. "Fetch & Sync to DB" Button Not Working
- Error: `Route POST:/api/cctns/fetch-and-sync not found`
- Root cause: The backend route file has the endpoint, but it may not be registered properly
- Need to verify the route registration in `backend/src/index.ts`

## Proposed Fixes

### Phase 1: Fix Backend Route Registration
**File**: `backend/src/index.ts`
- Verify `cctnsRoutes` is registered with correct prefix
- Check if the compiled JS file is up to date (TypeScript may not have been rebuilt)
- Ensure the route file is being imported correctly

### Phase 2: Fix Frontend UI Layout
**File**: `frontend/src/pages/admin/CCTNS.tsx`
- Move the 3 tabs to the TOP of the CCTNS content area (right below the header)
- Only show date range + "Fetch & Sync to DB" button when `activeTab === 'live'`
- Each tab should have its own clean layout without unrelated controls

### Phase 3: Fix Database Gateway Data Loading
**File**: `frontend/src/pages/admin/CCTNS.tsx`
- Remove `enabled: activeTab === 'synced'` condition or add `refetchOnMount: true`
- Ensure the query runs immediately when tab is clicked
- Add better error handling and loading states
- Verify the API response structure: `response.data.data.records` vs `response.data.data.data`

### Phase 4: Verify Backend Response Structure
**File**: `backend/src/routes/cctns.ts`
- The `GET /cctns` endpoint returns `{ data: records, pagination: {...} }`
- `sendSuccess` wraps this as `{ success: true, data: { data: [...], pagination: {...} }, message: 'Success' }`
- Frontend expects: `syncedQuery.data?.data?.data` which should resolve to `records`
- Need to verify this chain is correct

## Implementation Order

1. Fix backend route registration (rebuild if needed)
2. Rewrite frontend CCTNS.tsx with proper tab layout
3. Fix data loading for Database Gateway
4. Test all 3 tabs and the fetch button

## Files to Modify

- `backend/src/index.ts` — Verify route registration
- `frontend/src/pages/admin/CCTNS.tsx` — Complete UI rewrite
- `frontend/src/services/api.ts` — Verify API methods (if needed)
