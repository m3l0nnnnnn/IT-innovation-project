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
