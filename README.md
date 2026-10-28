# PS12d – Town Council Performance Early-Warning Tracker

A web application that helps **EM Services (EMS)** spot Town Council performance problems *before* management report scores fall below acceptable standards.

It brings together the operational data EMS already has, monitors KPIs, analyses performance trends, raises early-warning alerts and tracks corrective actions. The aim is more than another basic KPI dashboard.

> **Brief (EM Services):** Managers need to spot performance problems before scores fail. A good solution tracks feedback cases, response rates, outstanding issues and management report scores; alerts when a score is trending towards failing; logs corrective actions and their effect.

**Team:** Brina · Charles · Joel · Maahirah · Phoebe

---

## Contents

- [Project at a glance](#project-at-a-glance)
- [What the system helps managers do](#what-the-system-helps-managers-do)
- [Approach: a hybrid system](#approach-a-hybrid-system)
- [System workflow](#system-workflow)
- [Team and modules](#team-and-modules)
- [Technology stack](#technology-stack)
- [Development priorities](#development-priorities)
- [Shared team responsibilities](#shared-team-responsibilities)
- [Getting started](#getting-started)
- [Points to confirm with EMS](#points-to-confirm-with-ems)
- [References](#references)

---

## Project at a glance

| Item | Detail |
| --- | --- |
| Client | EM Services (HDB–Keppel Land JV, manages ~10 of 19 Town Councils) |
| Problem statement | PS12d, NYP IT Innovation Project (26S2) |
| Briefing call | Week of 2 Nov 2026 |
| Data | Excel export or mock API; real data only after NDA |
| Target fidelity | **Medium**: proof of concept on masked or sample data |

### Working assumptions (to confirm with EMS)

- Feedback must be acknowledged within **3 days**
- Cases left unclosed for **more than 7 days** count as an exception
- **4 or more** repeated cases at one block make a **hotspot**
- A case is either **Open** or **Closed**, with no other states

---

## What the system helps managers do

- Monitor feedback cases, response rates, outstanding issues and management report scores
- Spot declining performance before targets are breached
- Understand what is causing poor performance
- Get timely warnings about likely performance failures
- Assign and monitor corrective actions
- Check whether those actions improved performance
- Produce management reports with less manual work

---

## Approach: a hybrid system

We are building a **custom web application** and connecting it to **selected Microsoft services**, which makes EMS more likely to adopt it.

- **The custom application** handles the core functions: feedback management, KPI analysis, early-warning detection and corrective action tracking.
- **Microsoft integrations** fit into the way EMS already works: importing data from SharePoint, sending notifications through Teams or Outlook, and producing management reports.

The custom application stays the main platform. We add a Microsoft service only where it saves real effort. Which integrations we can build depends on the EMS or NYP accounts, permissions and licences available to us.

---

## System workflow

The five modules form one continuous loop of monitoring and improvement.

```
 1. Data Collection            Charles    Feedback cases and operational records are imported and organised
        │
        ▼
 2. Performance Analysis       Joel       KPIs are calculated, trends analysed, likely issues forecast
        │
        ▼
 3. Early-Warning Detection    Brina      Risks are evaluated, alerts generated, managers notified
        │
        ▼
 4. Corrective Action          Maahirah   Actions are assigned, progress monitored, effect evaluated
        │
        ▼
 5. Management Reporting       Phoebe     Everything is pulled together into dashboards and reports
        │
        └──────────────▶ repeats as new performance data arrives
```

---

## Team and modules

Each member owns one main module, covering its core functions and its additional features. All five modules are part of the same application and share data with each other.

| Member | Module | Main focus |
| --- | --- | --- |
| **Charles** | Feedback Case Management | Manage feedback records and identify recurring issues |
| **Joel** | KPI & Performance Analytics | Monitor KPIs, analyse trends and forecast performance |
| **Brina** | Early-Warning & Alert Management | Detect emerging risks and automate alerts |
| **Maahirah** | Corrective Action Management | Track actions taken and evaluate their effectiveness |
| **Phoebe** | Management Dashboard & Reporting | Bring performance information together and generate reports |

<details>
<summary><strong>1. Charles – Feedback Case Management</strong></summary>

Collects, organises and manages the feedback cases Town Councils receive. This module supplies the operational data that KPI calculations and early-warning detection rely on.

**Core features**

1. **Feedback case management**
   - View and manage feedback cases across Town Councils
   - Add, edit and update feedback records
   - Track case status (Open / Closed)
   - Search and filter by Town Council, location, category and status
   - View individual cases and their history
2. **Data import and management**
   - Import existing feedback records from Excel or CSV
   - Validate imported data and flag likely duplicates
   - Preview imported data before confirming
   - Organise data for the analytics and early-warning modules

**Additional features**

3. **Repeat-case hotspot detection**
   - Find blocks or locations with repeated complaints
   - Detect unusually high feedback volumes in an area
   - Categorise recurring problems (cleanliness, lift maintenance, pests…)
   - Show hotspots on an interactive map
   - Let managers open the cases behind each hotspot
4. **Microsoft SharePoint integration**
   - Pull existing feedback records from approved SharePoint or Excel sources
   - Reduce repeated manual data entry
   - Update the system when new data arrives

**Expected outcome:** one place for feedback data that also shows EMS where problems keep recurring.

</details>

<details>
<summary><strong>2. Joel – KPI & Performance Analytics</strong></summary>

Calculates and monitors performance indicators, analyses historical trends and forecasts likely performance issues. This module supplies the measurements the early-warning engine needs.

**Core features**

1. **KPI and threshold management**
   - Create and manage the KPIs EMS monitors
   - Configure targets and warning thresholds
   - Let authorised managers adjust KPI settings
   - Monitor KPIs across Town Councils
   - Possible KPIs: acknowledgement rate, closure rate, overdue or outstanding cases, average response and resolution time, recurring cases
2. **Performance trend analysis**
   - Calculate KPI results for each reporting period
   - Compare current performance with past results
   - Label each KPI as improving, stable or declining
   - Show KPI trends in interactive charts
   - Highlight significant changes

**Additional features**

3. **Days-to-fail forecasting**
   - Use historical KPI trends to estimate when performance may fall below standard
   - Identify KPIs that keep getting worse
   - Show the estimated time left before a threshold is breached
   - Pass forecasts to the early-warning module
   - *Example:* if a Town Council's response rate has fallen steadily for several weeks, estimate when it will drop below target. Forecasts are shown as estimates, not guarantees.
4. **Contributing-factor analysis**
   - Identify which feedback categories are dragging performance down
   - Highlight locations with unusually many outstanding cases
   - Detect large changes in complaint volume
   - Help managers see why a KPI is poor

**Expected outcome:** a module that shows EMS its KPI results, how they have trended, and which risks lie ahead.

</details>

<details>
<summary><strong>3. Brina – Early-Warning & Alert Management</strong></summary>

Identifies likely performance problems and notifies the right people before targets are breached.

**Core features**

1. **Early-warning detection**
   - Monitor KPI results and trends
   - Detect KPIs approaching their failure thresholds
   - Identify steady decline and sudden or unusual changes
   - Use forecasting results to flag likely future failures
   - Raise alerts when a risk is found
2. **Alert management**
   - Show all alerts in one place
   - Show the affected Town Council, KPI and reason for each alert
   - Filter by severity, status and Town Council
   - Let managers acknowledge and update alerts
   - Track outstanding, resolved and dismissed alerts, and keep their history
3. **Risk classification**
   - **Watch:** early signs of decline; keep monitoring
   - **Warning:** performance is nearing an unacceptable level and may need action
   - **Critical:** an agreed threshold has been breached, or the issue needs urgent attention

**Additional features**

4. **Automated notifications**
   - Notify the relevant officers or managers when an alert is raised
   - Include the affected KPIs and the risk involved
   - Send reminders for unacknowledged alerts
   - Escalate unresolved alerts to higher management
   - Avoid duplicate alerts and repeated notifications
5. **Microsoft Teams / Outlook integration**
   - Connect the alert system to Power Automate
   - Send notifications through Teams or Outlook, with alert details and a link to the alert
   - Explore acknowledging alerts directly from Teams
6. **Explainable alerts**
   - Explain why each alert was raised
   - Show the changes that triggered it, with the relevant KPI values and thresholds
   - Link to the supporting performance data
   - *Example:* instead of just "High Risk", the alert says the response rate has fallen for three weeks in a row and is nearing its minimum target.

**Expected outcome:** an early-warning system that spots emerging risks, explains each alert and notifies management before the issue gets worse.

</details>

<details>
<summary><strong>4. Maahirah – Corrective Action Management</strong></summary>

Manages the corrective actions taken in response to performance issues. It makes sure problems are followed up and lets managers check whether their actions helped.

**Core features**

1. **Corrective action management**
   - Create corrective actions for identified issues
   - Link actions to the relevant alerts or feedback cases
   - Assign actions to responsible officers
   - Set priorities and deadlines
   - Update progress and completion status
   - View and filter actions across Town Councils
2. **Task and progress tracking**
   - Monitor progress on assigned actions
   - Let officers add progress updates and remarks
   - Upload supporting evidence where needed
   - Highlight overdue or outstanding actions
   - Let managers review completed tasks

**Additional features**

3. **"Did it work?" effectiveness check**
   - Compare KPI performance before and after an action
   - Label the result as improved, unchanged or worse
   - Show before-and-after comparisons
   - Flag issues that may need more follow-up
   - *Example:* after extra officers are assigned to clear overdue cases, compare resolution rates before and after.
4. **Automated follow-ups and escalation**
   - Send reminders before action deadlines
   - Highlight overdue tasks
   - Escalate unresolved high-priority actions to managers
   - Keep a record of follow-ups
5. **Corrective action history**
   - Keep a record of past actions, completed and unresolved
   - Let managers see what was done for similar issues before
   - Build up a history of actions and their outcomes

**Expected outcome:** a module that helps EMS coordinate actions, keep up with follow-ups and see whether performance improved.

</details>

<details>
<summary><strong>5. Phoebe – Management Dashboard & Reporting</strong></summary>

The central dashboard and reporting module. It pulls in information from the other four modules to give EMS managers an overview of Town Council performance.

**Core features**

1. **Management report score management**
   - Add, import and manage management report scores
   - View scores and their history across Town Councils
   - Compare scores with performance targets
   - Filter by Town Council and reporting period
2. **Central management dashboard**
   - Overview of Town Council scores, response and closure rates, outstanding and overdue cases, active alerts, corrective actions in progress, and historical trends
   - Filter by Town Council, reporting period and performance category
3. **Performance drill-down**
   - Open a Town Council to see its detailed performance
   - See which KPIs drive its overall result
   - View the related feedback cases, alerts and corrective actions
   - Move between the summary and the detailed records

**Additional features**

4. **Cross-Town-Council benchmarking**
   - Compare KPIs across Town Councils
   - Highlight Town Councils that are improving or declining
   - Find issues shared by several Town Councils
5. **One-click management report**
   - Generate a report with KPI results, trend charts, alerts and corrective actions
   - Highlight important changes
   - Export to PowerPoint, Excel or PDF
   - Reduce manual report preparation
6. **Microsoft Power BI / SharePoint integration**
   - Use Power BI for extra visualisations
   - Store and share reports in approved SharePoint locations
   - Fit EMS's existing Microsoft-based reporting
7. **AI-generated management summary**
   - Summarise key KPI trends, significant changes and recurring issues
   - Summarise alerts and corrective actions
   - Suggest areas that need management attention
   - Base summaries only on verified system data
   - May be built as a shared feature: Phoebe builds the interface and other members supply the data

**Expected outcome:** one dashboard where EMS can monitor performance, compare Town Councils and produce reports quickly.

</details>

---

## Technology stack

We use **TypeScript across the whole stack** so the frontend and backend stay consistent. The system combines the custom application, a central database, selected Microsoft integrations and an AI assistant.

### Backend

| Technology | Purpose |
| --- | --- |
| Node.js | Backend runtime |
| TypeScript | Type safety and maintainability |
| Express.js | API framework |
| PostgreSQL | Application and performance data |
| Drizzle ORM | Database queries and migrations |
| JWT (HttpOnly cookies) | Authentication and sessions |
| bcrypt / Argon2id | Password hashing |
| Zod | Request validation |
| node-cron | Scheduled KPI checks and monitoring |
| Groq API (Qwen model) | AI assistant and management summaries |

The backend manages feedback cases, KPIs, alerts and corrective actions. It processes imported data, calculates KPIs, runs the trend, forecasting and early-warning logic, and handles authentication, permissions, Microsoft integrations, AI requests and scheduled notifications.

### Frontend

| Technology | Purpose |
| --- | --- |
| React + TypeScript | Web application |
| Vite | Dev server and build tooling |
| React Router | Navigation between modules |
| Tailwind CSS | Styling |
| shadcn/ui | Reusable UI components |
| Axios | API requests |
| React Hook Form | Forms |
| Zod | Form validation |
| Recharts | KPI, trend and forecast charts |
| react-markdown | Rendering AI responses |

The frontend gives all five modules one consistent interface. It shows dashboards, alerts and corrective actions, charts historical and forecast performance, and provides the reporting and AI insight screens.

### Microsoft integration

| Technology | Purpose |
| --- | --- |
| Microsoft Graph API | Access to authorised Microsoft 365 resources |
| SharePoint / Excel | Import operational data; store approved reports |
| Power Automate | Notifications, reminders and workflows |
| Microsoft Teams / Outlook | Alert and follow-up delivery |
| Power BI | Extra management analytics |
| Microsoft Entra ID | Possible future organisational sign-in |

### Supporting libraries and tools

| Technology | Purpose |
| --- | --- |
| ExcelJS | Excel import and export |
| PptxGenJS | PowerPoint management reports |
| Leaflet / OneMap | Hotspot map |
| GitHub | Source control and collaboration |
| Vitest | Unit tests |
| Supertest | Backend API tests |
| Playwright | End-to-end tests |

We add these tools only when the feature that needs them is being built.

### Technologies by member

Everyone works with React, TypeScript, Express, PostgreSQL, Drizzle ORM, GitHub and the testing tools. Each member builds both the frontend and backend for their own module.

| Member | Main technologies | Microsoft integration |
| --- | --- | --- |
| Charles | React, Express, PostgreSQL, Drizzle, ExcelJS, Leaflet | SharePoint / Graph API |
| Joel | TypeScript, PostgreSQL, Recharts, forecasting logic | None needed at first |
| Brina | Express, TypeScript, scheduled jobs, alert workflows | Power Automate, Teams / Outlook |
| Maahirah | React, Express, React Hook Form, Zod, Recharts | Possibly notifications |
| Phoebe | React, Recharts, PptxGenJS, reporting tools | Power BI / SharePoint |

---

## Development priorities

We build the core features first, then the additional ones.

| Member | Core features | Additional features |
| --- | --- | --- |
| Charles | Feedback management, data import and validation | Hotspot map, SharePoint integration |
| Joel | KPI configuration, calculations and trend analysis | Days-to-fail forecasting, contributing-factor analysis |
| Brina | Early-warning detection, risk classification, alert management | Teams/Outlook notifications, escalation, explainable alerts |
| Maahirah | Corrective action management and progress tracking | Effectiveness check, automated follow-ups |
| Phoebe | Management report scores and central dashboard | Automated reports, cross-TC benchmarking, Power BI, AI summaries |

### Key enhancements, once the core system works

1. **Days-to-fail forecasting:** estimate when performance may breach a target
2. **Microsoft integration:** fit into EMS's existing workflows
3. **Automated management reporting:** cut manual report preparation
4. **Corrective action effectiveness:** track whether performance actually improved
5. **Repeat-case hotspot detection:** find locations with recurring problems
6. **AI management assistant:** help managers understand trends and summarise performance

The AI assistant only interprets and summarises. It does **not** set official KPI scores or alert thresholds.

---

## Shared team responsibilities

- **System design and integration:** make the five modules work as one application, agree on shared data structures and workflows, and keep frontend and backend consistent.
- **UI/UX:** keep the design consistent and easy for managers and officers to use, and build reusable components where it makes sense.
- **Authentication and security:** secure login and permissions; users see only the Town Councils they are authorised for; sensitive data stays protected; external AI services receive only data approved for sharing.
- **Testing and QA:** test each feature and module, check calculations, forecasts and warning rules, test full workflows across modules, review AI-generated code before merging, and record known limitations.
- **Documentation and presentation:** keep technical and user docs up to date, record individual contributions, take part in final integration, and contribute to presentations and demos.

---

## Getting started

> No code has been committed yet. The setup steps below will be completed once the project is scaffolded.

**Prerequisites:** Node.js (LTS), PostgreSQL and Git.

```bash
git clone <repo-url>
cd IT-innovation-project
# install, database setup and run steps go here
```

### Seed data

Forecasting and the AI summaries need enough history to be useful, so we will generate **12+ months of realistic sample data for each Town Council**, covering cases, report scores, alerts and actions.

---

## Points to confirm with EMS

- [ ] Which KPIs and management report scores matter most?
- [ ] How are performance scores and failure thresholds calculated?
- [ ] What conditions should trigger an early-warning alert?
- [ ] Can EMS provide anonymised historical data for forecasting and testing?
- [ ] Which existing systems will supply performance data?
- [ ] Which Microsoft services are available for integration?
- [ ] Who are the intended users, and what information can each of them access?
- [ ] How are corrective actions currently assigned and monitored?
- [ ] What are the limitations of the previous KPI Tracking Dashboard prototype?
- [ ] Which features would make EMS most likely to pilot or adopt the solution?

---

## Project goal

We want to go beyond a traditional performance dashboard by putting KPI monitoring, forecasting, early warnings, corrective action tracking and management reporting in one platform. A TypeScript application with selected Microsoft integrations stays flexible while fitting how EMS works.

In the end, the system should help EMS managers **spot problems earlier, understand the risks, take corrective action and see whether it worked.**

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
