# 12d Early-Warning Tracker

A KPI early-warning tracker for **EM Services (EMS)** Town Council managers. It flags performance problems *before* scores fail, so managers can act early and see whether their fix worked.

> **Brief (EM Services):** Managers need to spot performance problems before scores fail. A good solution tracks feedback cases, response rates, outstanding issues and management report scores; alerts when a score is trending towards failing; logs corrective actions and their effect.

---

## Project at a glance

| Item | Detail |
| --- | --- |
| Client | EM Services (HDB–Keppel Land JV, manages ~10 of 19 Town Councils) |
| Brief | 12d, NYP IT Innovation Project (26S2) |
| Briefing call | Week of 2 Nov 2026 (max 10 questions per team) |
| Data | Excel export or mock API; real data only after NDA |
| Stack constraint | None, but Microsoft-friendly solutions are more likely to be adopted |
| Target fidelity | **Medium**: proof of concept on masked or sample data |

### Working assumptions (to confirm at the briefing)

- Feedback must be acknowledged within **3 days**
- Cases left unclosed for **more than 7 days** count as an exception
- **4 or more** repeated cases at one block make a **hotspot**
- A case is either **Open** or **Closed**, with no other states

---

## How it works

```
 1 · Feedback Cases ──computes──▶ 2 · KPIs vs Thresholds ──trend nears fail line──▶ 4 · Early-Warning Alerts
                                        ▲          ▲                                         │
 3 · Mgmt Report Scores ────────────────┘          └──────── effect fed back ──── 5 · Corrective Actions
```

1. **Feedback cases** and **management report scores** are the inputs.
2. **KPI definitions** turn them into pass/fail values against a target, warning band and fail threshold.
3. **Alerts** fire when a KPI trend approaches the fail line.
4. **Corrective actions** close the loop by recording the KPI before and after, which feeds back into the KPI history.

We build on data EMS already collects. We are **not** building a data-entry system for EMS staff.

---

## Core features (CRUD)

Each feature is its own entity with full Create, Read (list, detail, filter), Update and Delete, plus validation.

| # | Feature | Key fields | Brief line it covers |
| --- | --- | --- | --- |
| 1 | **Feedback Case Management** | Case ID, Town Council, block/location, category (cleanliness, lift, lighting, pest…), channel (email/call/OneService), date received / acknowledged / closed, status (Open/Closed), assigned officer, linked duplicate ID | Tracks feedback cases, response rates, outstanding issues |
| 2 | **KPI & Threshold Configuration** | KPI name, metric type (% acknowledged ≤ 3 days, % closed ≤ 7 days, open cases > 7 days, repeat-case count), Town Council, target, warning band, fail threshold, reporting period | Defines what "trending towards failing" means |
| 3 | **Management Report Scores** | Town Council, period (month), report type (TC rating / OneService satisfaction / audit), score, max score, pass mark, uploaded by, notes | Management report scores; feeds the trend chart |
| 4 | **Early-Warning Alerts** | Alert ID, Town Council, triggering KPI or score, severity (Watch/Warning/Critical), trend evidence (last N values), date raised, recipients, status (New/Acknowledged/Resolved/Dismissed), acknowledged by | Alerts when a score is trending towards failing |
| 5 | **Corrective Action Log** | Action ID, linked alert/case, Town Council, description, owner, start/target date, status (Planned/In Progress/Done), KPI value before/after, outcome rating | Logs corrective actions and their effect |

**Shared dashboard** (team feature): sits on top of all five features. It has filters for owner, category, Town Council and status, and you can click from a KPI card through to the underlying cases.

---

## Wow features

### Tier 1: building these

| # | Feature | What it does |
| --- | --- | --- |
| W1 | **Days-to-fail forecast** | Fits a linear trend or moving average on each KPI and shows a countdown, e.g. *"At this rate, Pasir Ris-Punggol TC breaches the 7-day closure KPI in ~12 days."* |
| W2 | **One-click management pack** | Generates a meeting-ready PDF/PPTX with KPI cards, trend charts, open alerts, and the actions taken with their effect |
| W3 | **AI weekly brief + suggested actions** | An LLM summarises alerts and case data in plain English and answers manager questions using our data |
| W4 | **Repeat-case hotspot map** | A Leaflet + OneMap map of blocks, coloured by repeat-case count; blocks with ≥ 4 repeated cases are flagged |

### Tier 2: if time allows

| # | Feature | What it does |
| --- | --- | --- |
| W5 | **"Did it work?" effect scoring** | When an action closes, compares the KPI 30 days before and after and labels it Effective / No change / Worse |
| W6 | **Excel/IEMS drop-folder ingestion** | Drag in a raw IEMS/TCMS export; the app maps the columns, removes duplicates and recomputes KPIs |
| W7 | **Alert routing and escalation** | Alerts go to the officer first; if not acknowledged after N days, they escalate to the manager, then the GM |
| W8 | **Cross-Town-Council benchmarking** | A league table of all TCs for each KPI, for the HQ view |

### Tier 3: stretch

- Power Automate / Teams / Outlook notification on Critical alerts
- Role-based views (HQ → TC manager → officer)
- What-if simulator ("if we close 20 cases this week, what does the score become?")
- Seasonal baseline (flags a category above its usual seasonal level)

---

## Microsoft integration

EMS runs on Dynamics 365, Outlook, Excel, SharePoint and Teams. The core app does not depend on any one platform. Microsoft services connect through adapters, so the app still runs without them. In short: it works today with Excel and can plug into D365 later.

| # | Integration | Priority |
| --- | --- | --- |
| M1 | Excel/SharePoint as the data source (Graph API or Power Automate) | Build |
| M2 | Outlook email alerts to manager and officer | Build |
| M3 | Teams Adaptive Card on Critical alerts (via Power Automate, not legacy webhooks) | Build for the demo |
| M4 | Management pack as real `.pptx` / `.xlsx`, saved to SharePoint | Build |
| M5 | Power BI companion dashboard | Optional |
| M6 | Microsoft Forms intake for corrective actions | Optional |
| M7 | Entra ID login (SSO) with roles from Entra groups | Optional |

**Pitch only (not built):** D365 Dataverse adapter (stubbed behind a mock), Power Apps mobile screen, Copilot Studio agent.

---

## Team split

| Member | CRUD feature | Wow feature | Stretch | Status |
| --- | --- | --- | --- | --- |
| _TBD_ | 1 · Feedback Case Management | W4 Hotspot map | W6 Excel/IEMS ingestion + duplicate detection | Not started |
| _TBD_ | 2 · KPI & Threshold Configuration | W1 Days-to-fail forecast | Scheduled KPI recompute on case change | Not started |
| _TBD_ | 3 · Management Report Scores | W8 Cross-TC benchmarking | Trend chart per TC with threshold line | Not started |
| _TBD_ | 4 · Early-Warning Alerts | W7 Alert routing and escalation | Email/SMS-style notification on alert creation | Not started |
| _TBD_ | 5 · Corrective Action Log | W2 Management pack + W3 AI brief | W5 "Did it work?" scoring | Not started |

**Shared team work:** dashboard page, seed-data generator (12+ months per Town Council), and the common data model.

---

## Getting started

> The tech stack is still being decided. This section will be filled in once the project is set up.

```bash
git clone <repo-url>
cd IT-innovation-project
# install and run steps go here
```

### Seed data

The forecast and AI features need enough history to be useful. The seed-data generator should produce **12+ months of realistic data per Town Council**, covering cases, report scores, alerts and actions.

---

## Open questions for the 2 Nov briefing

- [ ] What exactly is the "management report"? How often is it produced, and how are its scores and pass marks calculated?
- [ ] Which KPIs matter most: response time, closure time, open cases > 7 days, repeat cases, satisfaction score?
- [ ] Confirm the thresholds: acknowledge within 3 days, unclosed > 7 days, ≥ 4 repeat cases = hotspot
- [ ] Walk us through a recent performance problem you wish you had caught earlier.
- [ ] What should trigger a warning, and who receives it (officer, TC manager, GM)? Email, SMS or both?
- [ ] When a warning fires, what does a manager do today, and how do you know whether it worked?
- [ ] Can we get anonymised historical case data and a sample management report? In what format, and how often is it refreshed?
- [ ] Who are the primary users: HQ, TC managers, property officers?
- [ ] What three things must the prototype show for you to rate it Medium fidelity or above?

---

## References

Source documents (Company Requirements drive, `26S2/12. EM Services`):

- `12_EM_Services_EMS.pdf`
- `PS 4C Brief - EMS.pdf`
- `EM Problem Statement - Interactive dashboard.pdf`
- `EMS_NYP_PS_Prototype_Tracker.xlsx`
- `4A statement Workflow for NYP Students 9 June 2026.pdf`
- `EM Svcs Transcript.vtt`
- `Q&A for company 4.docx`
