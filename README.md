# AHK Academy — 100-Day Data Analyst Learning Hub

AHK Academy is a GitHub-first, business-oriented learning platform for practical data analysis. It combines daily curriculum, stakeholder-style exercises, datasets, browser-based SQL practice and locally stored learner progress.

## Current release

| Resource | Current state |
|---|---:|
| Published curriculum | Day 1–Day 11 |
| Published topics | 55 |
| Business learning tasks | 165 |
| Topics per day | 5 |
| Questions per topic | 3 |
| Registered datasets | 3 |
| Primary practice dataset | `orders` (150 rows) |

Day 12–100 remains unpublished. Published days unlock sequentially: Day 1 is available first; each next published day unlocks after the previous day is completed.

## Learning sequence

- **Days 1–25:** SQL
- **Days 26–50:** Excel
- **Days 51–75:** Power BI and DAX
- **Days 76–100:** Python and Pandas

Every published day contains five topics and three stakeholder-style business requests per topic. Curriculum is stored as individual JSON resources so new daily lessons can be published without editing the application runtime.

## Frontend capabilities

- Responsive learning workspace with curriculum navigation, lesson content and practice panel.
- Four teaching modes: Teacher, Explain, Deep learning and Analyst mindset.
- Topic navigation and question-level business briefs.
- Search across published topics and business requests (`Ctrl/⌘ + K`).
- Projects library with business-oriented project pathways.
- Progress dashboard with separate course, task and track measures.
- Local progress persistence with JSON backup export/import.
- Light and dark themes.
- Accessible landmarks, labelled controls, visible keyboard focus and reduced-motion support.
- Service worker caches the application shell, published curriculum and registered datasets for repeat visits and offline reading.

## Practice engine

The browser practice engine uses SQL.js/SQLite and loads the active datasets from `datasets/index.json`. The current registry includes `orders`, `customers` and `product-catalog`; the SQL table for `product-catalog` is exposed as `product_catalog`.

The engine is read-only, rejects data-changing statements and multiple statements, and caps displayed query results. The SQL.js runtime is currently loaded from a pinned jsDelivr release, so first-time SQL engine initialization requires network access. The application shell, curriculum and CSV datasets can be cached for offline reading; the SQL runtime is not guaranteed to initialize offline on a fresh browser profile.

Task completion is explicitly learner self-assessment after a successful query execution. Automated semantic grading of every business request is not yet implemented and should not be represented as automatic correctness validation.

## Learner data and privacy

Learner progress is stored in browser `localStorage`. It is not committed to GitHub and is not sent to an application server. Use the Progress section to export a backup before clearing browser data or changing devices. Import is supported for the versioned AHK Academy progress format.

## Repository structure

```text
.
├── index.html
├── manifest.json
├── sw.js
├── assets/
│   ├── css/app.css
│   └── js/
│       ├── app.js
│       └── core/
│           ├── curriculum-service.js
│           └── progress-store.js
├── engines/sql-engine.js
├── curriculum/
│   ├── index.json
│   └── day-NNN.json
├── coding-arena/
├── datasets/
│   ├── index.json
│   ├── orders/
│   ├── customers/
│   └── product-catalog/
├── schemas/curriculum-day.schema.json
├── tests/
│   ├── validate-repository.mjs
│   ├── server.cjs
│   ├── unit/
│   └── e2e/
├── playwright.config.cjs
└── .github/workflows/deploy.yml
```

## Run locally

Requires Node.js 20 or newer.

```bash
npm install
npm run validate
npm test
npm run test:e2e
```

Playwright requires Chromium to be installed once:

```bash
npx playwright install chromium
```

The Playwright configuration starts a small local static server on `127.0.0.1:4173`.

## Publishing a new curriculum day

1. Add `curriculum/day-NNN.json` with exactly five topics and three questions per topic.
2. Add the matching coding-arena resource when the day has coding challenges.
3. Add or reuse required datasets and update `datasets/index.json` when necessary.
4. Update `curriculum/index.json` with the day metadata and release boundary.
5. Update `manifest.json` with the same `published_through_day` and `open_days` values.
6. Run `npm run validate` and `npm test`.
7. Open a pull request. CI runs repository checks, unit tests and Playwright browser tests before deployment.

## Quality gates

The GitHub Actions workflow validates JavaScript syntax, release/index consistency, published curriculum shape, question identifiers, dataset references, CSV/schema headers, dataset row counts, and the application entry files. It also runs Node unit tests and Playwright smoke tests for the learning journey, navigation, teaching modes, search, theme switching and mobile overflow.

A green CI run is a release gate, not a substitute for a full manual browser matrix, screen-reader review or real-device testing. The workflow also runs a three-pass mobile Lighthouse CI audit and blocks deployment unless the median Performance, Accessibility, Best Practices and SEO scores are each at least 95/100. The actual scores are recorded as CI artifacts; the 95-point thresholds are targets, not claimed results until that run completes.

## Design and engineering principles

- Business-first instruction and practical stakeholder requests.
- Curriculum and datasets remain separate from the UI runtime.
- One versioned learner state store with migration from earlier local progress keys.
- Sequential access based on published content and completed prior days.
- Read-only query execution against deterministic learning data.
- Accessible, responsive interfaces with progressive enhancement.
- Changes validated before GitHub Pages deployment.