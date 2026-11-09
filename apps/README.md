# Estara application skeleton

The root `package.json` uses npm workspaces. Run from the **repository root**:

```powershell
npm install
npm run dev
```

Then open **http://localhost:5173**. The Express API health endpoint is **http://localhost:4000/api/health**.

Checks: `npm run check`, `npm run test`, `npm run build`.

The UI uses **synthetic demo data** from Express and does not require PostgreSQL yet. Database tables are defined as a foundation, but persistence, login, permissions, Groq AI chat, Microsoft Graph/Power Automate and production notification scheduling are **not implemented**. Do not upload real or identifiable EMS data.

Suggested workflow: review this branch with a pull request, then merge to `main`. On your Windows machine run `git switch main`, `git pull --ff-only origin main`, `npm install`, `npm run dev`.

For future database setup, copy `apps/api/.env.example` to `apps/api/.env` and supply approved local database credentials. Never commit `.env` or secrets.

Current modules: Phoebe (dashboard/reports), Charles (cases), Joel (KPI analytics), Brina (alerts), Maahirah (corrective actions), shared AI placeholder.

## Account settings (demo)

The **Account Settings** page (`/settings`) supports browser-local profile labels, warning/reminder/digest preferences, display density and reduced motion. It uses `localStorage` in the current browser, not a real account database. **No email or push notifications are sent**. Passwords, MFA, sessions, sign-out and real profile changes require an authentication service and backend permission checks, which are not included in this skeleton. Do not enter genuine user or resident data in this prototype.

## Feedback cases API (Charles)

Reads and writes the `feedback_cases` table in Supabase, so it needs `apps/api/.env` (see the root README). Run `npm run db:seed` for demo data.

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/cases` | Filters: `townCouncilId`, `block`, `category`, `channel`, `status`, `officer`, `from`, `to`, `overdue=true` (open > 7 days), `q` (search). Paging: `page`, `pageSize` (max 100). Sorting: `sort`, `order`. Returns `{ data, page, pageSize, total }`. |
| GET | `/api/cases/meta` | Town Councils, categories, channels and statuses for dropdowns |
| GET | `/api/cases/:id` | `:id` is the UUID or the case reference (`FB-000123`). Includes `duplicates`. |
| POST | `/api/cases` | Creates a case; `caseRef` is assigned automatically |
| PATCH | `/api/cases/:id` | Partial update. `{"status":"Closed"}` stamps `closedAt` with the current time; `{"status":"Open"}` reopens the case. |
| DELETE | `/api/cases/:id` | Unlinks any duplicates, then deletes the case |

Validation lives in `apps/api/src/lib/cases.ts`. Invalid input returns `400` with an `issues` list.

## KPI & performance analytics API (Joel)

Calculates KPIs from the `feedback_cases` table on request, so results always reflect the latest cases. Needs `apps/api/.env`. After pulling, run `npm run db:migrate` (adds `kpi_definitions`, `kpi_council_targets`, `kpi_change_log`), then `npm run db:seed-kpis` to add the six starting KPIs without touching existing data (`npm run db:seed` also adds them).

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/kpis/overview` | Every active KPI × Town Council: latest value, status, trend, forecast, sparkline. `period=week\|month`, `townCouncilId`, `asOf` |
| GET | `/api/kpis/forecasts` | **Feed for the early-warning module**, most urgent first. `atRiskOnly=true`, `period`, `townCouncilId`, `asOf` |
| GET | `/api/kpis/series` | One KPI for one council: full series, analysis, projection and forecast backtest. `kpiId`, `townCouncilId`, `period`, `asOf` |
| GET | `/api/kpis/factors` | Contributing factors: category contributions, unusual outstanding blocks, complaint volume changes. `kpiId`, `townCouncilId`, `asOf` |
| GET | `/api/kpis/metrics` | The calculations a KPI can use |
| GET | `/api/kpis/definitions` | KPI settings with council-specific targets. `includeArchived=true` |
| GET | `/api/kpis/definitions/:id/history` | Who changed what, and when |
| POST / PATCH | `/api/kpis/definitions[/:id]` | Create or update a KPI (managers only). The calculation cannot change after creation; archive with `{"active":false}` |
| PUT / DELETE | `/api/kpis/definitions/:id/targets/:townCouncilId` | Set or remove a council's own target and warning line (managers only) |

**`asOf`** (date, up to a year back) recalculates everything with only the cases, acknowledgements and closures recorded by then. Use it to demo what the system would have shown before a breach.

**Forecast feed rows** (`/api/kpis/forecasts`) contain `status` (On track / At risk / Breached / No data), `trend` (improving / stable / declining), `forecast.daysToTarget` with a likely `range` and `confidence`, `forecast.estimatedBreachAt`, `worseInLastPeriods`, a plain-English `explanation`, a `link` to the trend page, and a `suggestedSeverity` (Critical = breached; Warning = forecast breach within 4 weeks at medium/high confidence, or at risk and declining; Watch = at risk, declining or any breach forecast within 6 months). The suggestion is there for convenience: the early-warning module owns the final alert rules.

How the numbers work (all in `apps/api/src/lib/`):

- **KPIs** (`kpi-calc.ts`): weeks start Monday, Singapore time. On-time rates leave out cases still inside their day limit, so the latest period is not flattered. Average times use cases completed in the period. A rate or average from fewer than 10 cases is shown as no data.
- **Trend** (`kpi-trend.ts`): a straight line through the last 12 complete weeks (or 6 months). It counts as improving or declining only when the slope is statistically clear (t-test, 95%) *and* the change is big enough to matter (2 percentage points, 0.25 days, or 10% of a case-count target).
- **Days-to-fail**: the same line extended to the target. The likely range uses the slope ± one standard error. A forecast is only made when the line heads the wrong way by more than its own uncertainty.
- **Backtest** (`kpi-engine.ts`): reruns the forecast at the end of each of the last 16 weeks and reports how early it warned before a sustained breach (two periods in a row), and how far off it was.
- **Contributing factors** (`kpi-factors.ts`): splits the 4-week vs previous 12-week change between categories, so the contributions add up to the total. Flags blocks whose open cases are very unlikely (p < 1%) given their usual share of cases, and category volumes that changed sharply (Poisson, at least 25%), compared with the same weeks last year to spot seasonal patterns.

**Permissions are a demo stand-in.** Changing KPI settings requires the `X-Estara-Role` header to be `Administrator` or `EMS Manager`. The web app sends the role-preview role, and anyone can send that header, so replace it with the JWT session check when login is built (`requireKpiManager` in `routes/kpis.ts`). The legacy starter page's fictional KPI list moved to `/api/demo/kpis`.
