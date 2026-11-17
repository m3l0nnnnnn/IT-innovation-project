# Estara quality suite

Run commands from the repository root with Node.js 22+:

```bash
npm ci
npm run check
npm test
npm run build
node --test tests/api-smoke.test.mjs
npm install --no-save --package-lock=false @playwright/test@1.58.2
npx playwright install chromium
npx playwright test
```

## Scope

- Existing `apps/api/src/tests/*.test.ts`: unit tests of risk, case validation, KPI computations, trend forecasting, hotspots, imports, and synthetic seed scenarios.
- `tests/api-smoke.test.mjs`: starts the actual Express server on port 49187 and checks health, demo response contracts, error responses, body-size protection, HTTP security headers, and CORS. These checks intentionally avoid write operations and do not need PostgreSQL.
- `tests/ui.spec.ts`: Playwright Chromium tests for navigation, responsive case filters, sidebar persistence, direct KPI navigation, and missing-route recovery.
- `.github/workflows/quality.yml`: runs type checking, existing unit tests, build, API smoke, and browser tests on pull requests and main branch updates.

## Limitations and release gates

This suite does **not** prove that PostgreSQL CRUD, migrations, KPI reads from live data, uploaded CSV files, Excel exports, Microsoft integrations, notifications, accessibility, concurrency, or authentication work correctly. Add dedicated disposable-database tests before declaring those areas verified. Never point destructive test flows at a shared team Supabase database.

Current `X-Estara-Role` access control is intentionally a prototype shortcut: a client can supply its own header. Treat this as an **open security issue**, not as a passing authorization check. Do not expose database-backed writes publicly before authenticated server-side permission checks are implemented.

For E2E failures caused by environment-dependent demo roles, investigate whether the route is intentionally hidden before changing assertions. A green run verifies the listed smoke flows only.
