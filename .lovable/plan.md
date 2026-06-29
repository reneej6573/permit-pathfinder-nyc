## Goal

Add a single new option — **Restaurant / Food Service** — to the existing `BUSINESS TYPE (optional)` dropdown in the Explorer's "Projected wait for this ZIP" card. Selecting it loads DCWP licenses that are restaurant-relevant from the existing `ptev-4hud` dataset, surfaces them in `INCLUDED IN THIS ESTIMATE` using the current row style, and respects the current parallel-filing bottleneck logic. No redesign, no new tabs, no new components.

## Scope

Single file edit: `src/routes/index.tsx`. No changes to server functions, query layer, types, or other routes.

## Approach

1. Define a synthetic category constant inside `index.tsx`:
   ```
   const RESTAURANT_CATEGORY = "Restaurant / Food Service";
   const RESTAURANT_DCWP_CATEGORIES = [
     "Sidewalk Cafe",
     "Tobacco Retail Dealer",
     // any other DCWP categories already returned by dcwpCategoriesQuery
     // that are restaurant-relevant (filtered at runtime against the live
     // category list so we never reference one that doesn't exist).
   ];
   ```
   The final list is intersected with `dcwpCategories` at runtime so we only pull categories the dataset actually returns today.

2. Inject the synthetic option into the dropdown above the live DCWP categories:
   - Render `<option value={RESTAURANT_CATEGORY}>Restaurant / Food Service</option>` first.
   - Keep all existing live categories beneath it (unchanged).

3. Data fetching for the synthetic option:
   - When `selectedCategory === RESTAURANT_CATEGORY`, call `useQueries` with `dcwpPermitsForCategoryQuery(cat)` for each matched sub-category (parallel fetches; existing query, no new server function).
   - Flatten results into the same `dcwpPermits` shape already consumed by the UI. Prepend the sub-category name to `licenseType` only if needed for disambiguation (kept short to fit the existing row).
   - When `selectedCategory` is anything else, behavior is unchanged (single `useQuery` path).

4. Suggested licenses checklist:
   - Uses the same `toggleDcwp` / `dcwpSelectionsByCategory[RESTAURANT_CATEGORY]` plumbing already in place — no new state shape.
   - Default-selected = all items with `avgDays > 0` (matches today's "all selected" default for normal categories, but excludes timing-unavailable rows so they don't silently inflate the bottleneck).

5. Projected-wait logic (`combinedEstimate`) — no change to formula:
   - Items with `avgDays > 0` are added to `parts` exactly like today and participate in the parallel/bottleneck calculation.
   - Items with `avgDays <= 0` (no timing available from the dataset) are skipped from `parts` but rendered in `INCLUDED IN THIS ESTIMATE` with a `timing unavailable` tag in place of the `Nd` value, using the existing row markup.

6. Suggested-licenses checkbox rows already show `~{avgDays}d`; when `avgDays === 0`, show `timing unavailable` in the same slot.

## Edge cases

- If none of the curated DCWP sub-categories exist in the live `dcwpCategories` response, the synthetic option still appears but its checklist shows the existing empty state (`No license data for this business type.`). Projected wait then reflects DOB only, unchanged.
- DOB permit + ZIP selection continue to drive the DOB half of the estimate; the restaurant option only affects the DCWP half.
- No changes to `Calculate my Deadline` link, footer, or the predictor route.

## Out of scope

- Server-side aggregation of a "restaurant" composite category.
- Persisting the synthetic category across routes (Predictor still uses raw DCWP categories).
- New UI components or styling tokens.
