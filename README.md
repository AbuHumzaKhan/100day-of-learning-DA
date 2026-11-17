# AHK Academy — 100-Day Data Analyst Business Trainer

AHK Academy is a GitHub-first learning application for practical Data Analyst skills. Curriculum and datasets are version-controlled in this repository; individual learner progress is stored locally in the learner's browser.

## Current release

| Resource | Current state |
|---|---:|
| Published learning days | **Day 1–Day 11** |
| Topics per published day | **5** |
| Business requests per published day | **15** |
| Published topics | **55** |
| Published business requests | **165** |
| Registered datasets | **3** |
| Primary dataset | **orders (150 rows)** |
| Next curriculum release | **Day 12** |

The published-day count is controlled by manifest.json and curriculum/index.json. A published day is not automatically unlocked for a learner: the previous day must be completed locally.

## Learning sequence

- **Days 1–25:** SQL
- **Days 26–50:** Excel
- **Days 51–75:** Power BI & DAX
- **Days 76–100:** Python & Pandas

## Frontend capabilities

- JSON-driven daily curriculum with five topics and three business requests per topic.
- Four teaching modes: Teacher, Explain, Deep Learning and Analyst Mindset.
- Sequential progression through published days.
- Versioned local progress storage with migration from the previous task-state key.
- Separate release progress and learner completion metrics.
- Curriculum-wide search across day titles, topics and stakeholder requests.
- Project library with business briefs and defined deliverables.
- Browser-local SQL practice using the registered CSV datasets.
- Dataset schema and sample-row inspection.
- Mobile-first responsive layout and keyboard-accessible primary navigation.

## Runtime and data

The application is a static site using native JavaScript modules. Curriculum is loaded from curriculum/index.json; dataset definitions are loaded from datasets/index.json.

The SQL engine loads SQL.js from a pinned jsDelivr CDN version and creates read-only SQLite tables in the browser for all active datasets. The SQL editor accepts one SELECT or WITH statement at a time and enables SQLite query-only mode after loading. Initial SQL engine setup therefore requires network access to the CDN; the static curriculum does not require the SQL engine to initialize.

Registered datasets:

| Dataset ID | Grain | Rows |
|---|---|---:|
| orders | One row per order transaction | 150 |
| customers | One row per customer | 20 |
| product-catalog | One row per product | 10 |

SQL table names are derived from dataset IDs. For example, product-catalog is available as product_catalog.

## Repository structure

~~~text
assets/
  css/academy.css
  js/app.js
  js/core/storage.js
engines/
  sql-engine.js
curriculum/
  index.json
  day-001.json ... day-011.json
datasets/
  index.json
  orders/
  customers/
  product-catalog/
schemas/
  curriculum-day.schema.json
scripts/
  validate-content.mjs
tests/e2e/
  academy.spec.js
playwright.config.mjs
manifest.json
index.html
~~~

## Learner state and unlocking

State is kept in a versioned local-storage object named ahk_academy_state_v1. It records the active day, reviewed tasks, completed days and update timestamp. The storage service attempts to migrate the earlier ahk_task_status_v5, ahk_active_day_v5 and ahk_completed_day_N values.

A learner can mark a question as reviewed after checking their own work. A day is completed only when every question in that day is marked reviewed and the learner selects **Complete day**. The next published day then becomes available. This is self-review progress tracking, not automated grading of the learner's SQL or Excel answers.

Progress is device-local. Clearing browser storage or changing devices can remove or separate that progress; learners should export their progress JSON before moving devices.

## Publishing a new day

1. Add curriculum/day-NNN.json with five topics and three business questions in each topic.
2. Add or reuse datasets and update datasets/index.json if needed.
3. Update curriculum/index.json with the new day metadata and sequential open_days.
4. Update manifest.json with the same published_through_day, open_days and next_day.
5. Run npm run validate:content.
6. Commit the complete resource set together.

The content validator checks the formal JSON Schema, release/index agreement, question counts, duplicate question IDs, dataset references, dataset schema/CSV headers and row counts.

## Local development and testing

Requirements: Node.js 22+, npm and Python 3.

~~~bash
npm install
npm run validate:content
npx playwright install chromium
npm run test:e2e
~~~

Playwright starts a local static server automatically. The browser suite covers sequential unlocking, teaching modes, question completion, navigation, search, SQL execution and a 390px mobile viewport.

## Deployment

GitHub Actions runs JavaScript syntax checks, curriculum/data validation and Playwright browser tests for pull requests and pushes to main. GitHub Pages deployment runs only after the validation job succeeds on main or a manual workflow dispatch.

## Design and engineering principles

- Business-first, scenario-driven learning.
- Repository content is authoritative; browser storage is learner-specific.
- One state contract for task completion and release progression.
- Explicit loading, empty and error states.
- Responsive, keyboard-operable interface.
- Validation before publishing daily resources.
- Keep execution engines modular and load expensive runtimes only when used.
