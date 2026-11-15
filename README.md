# 100-Day Data Analyst Business Trainer

A GitHub-first content repository for a structured **100-Day Data Analyst Business Trainer**.

The learner application reads these resources at runtime. Learner completion state remains local to the learner and is never stored in this repository.

## Current release

| Resource | Status |
|---|---|
| Published learning days | **Day 1–Day 10** |
| Track | **SQL** |
| Topics per day | **5** |
| Business questions per topic | **3** |
| Learning questions | **150** |
| Coding Arena questions | **30** |
| Primary dataset | **orders** |
| Primary dataset rows | **150** |
| Supporting datasets | **customers (20), product-catalog (10)** |
| Days 11–100 | **Locked / not published** |

**Days 1–10 are open right now. Day 11+ remains locked until its resources are published.**

Progression is sequential: a learner can move from Day 1 → Day 2 → Day 3 only after completing the previous day. Future days remain locked until their GitHub resources are published.

## Learning sequence

- **Days 1–25:** SQL
- **Days 26–50:** Excel
- **Days 51–75:** Power BI & DAX
- **Days 76–100:** Python & Pandas

## Published curriculum

### Day 1 — SELECT & Reading Business Data

1. SELECT — Retrieving Business Data
2. Selecting Multiple Columns
3. Column Aliases
4. Calculated Columns in SELECT
5. Building a Business Output

**Business capability:** translate a stakeholder request into a clean transaction-level SQL output.

### Day 2 — DISTINCT, Sorting & Aggregated Business Views

1. DISTINCT
2. ORDER BY
3. LIMIT
4. GROUP BY
5. HAVING

**Business capability:** move from row-level retrieval into unique-value analysis, rankings, Top-N outputs, aggregation, and thresholded management views.

### Day 3 — Filtering & Business Rule Logic

1. WHERE
2. Comparison Operators
3. AND, OR & NOT
4. IN & BETWEEN
5. LIKE

**Business capability:** translate business rules into reliable SQL filters.

## Coding Arena — business scenario model

Every Coding Arena challenge now contains both a coding requirement and a business decision context:

- **Role:** who needs the analysis
- **Scenario:** what is happening in the organization
- **Business objective:** why the result matters
- **Request:** what the analyst has been asked to produce
- **Required output:** expected result structure
- **Constraints:** data and analytical rules
- **Success criteria:** how the answer will be validated
- **Decision use:** how the output may be used by the stakeholder

This prevents the arena from becoming a collection of isolated SQL syntax exercises.

## Dataset model

### orders

- 150 rows
- 12 columns
- one row per order transaction
- January–May 2026 dates
- categorical dimensions and numeric measures
- zero and negative profit edge cases
- deterministic values for repeatable validation

### customers

- 20 rows
- one row per customer
- segment, region, state, and primary category
- designed for customer segmentation and join practice

### product-catalog

- 10 rows
- one row per product
- category, product family, list price, and standard margin
- designed for product benchmarking and join practice

Relationships are documented in `datasets/index.json`.

## Repository structure

```text
100day-of-learning-DA/
├── README.md
├── manifest.json
├── schemas/
│   └── curriculum-day.schema.json
├── curriculum/
│   ├── index.json
│   ├── day-001.json
│   ├── day-002.json
│   └── day-003.json
├── coding-arena/
│   ├── index.json
│   ├── day-001.json
│   ├── day-002.json
│   └── day-003.json
└── datasets/
    ├── index.json
    ├── orders/
    │   ├── README.md
    │   ├── data.csv
    │   └── schema.json
    ├── customers/
    │   ├── README.md
    │   ├── data.csv
    │   └── schema.json
    └── product-catalog/
        ├── README.md
        ├── data.csv
        └── schema.json
```

## Content contract

Every curriculum day contains:

- day number
- track
- title and description
- dataset references
- exactly 5 topics
- teaching content for multiple learning modes
- exactly 3 scenario-driven business questions per topic
- expected outputs and validation rules

Every Coding Arena day contains:

- day number
- track
- title
- dataset references
- execution targets
- 10 coding challenges
- progressive difficulty
- business scenario context
- validation criteria

## Learning modes

The curriculum supports:

- **teacher** — structured instructor-style teaching
- **explain** — concise concept explanation
- **detailedlearning** — deeper practical reasoning
- **expose** — the analyst mindset behind the technique

The JSON already stores separate content for these modes. The frontend must render the selected mode instead of merely changing the active tab.

## Publishing a new day

To publish Day 4:

1. Add `curriculum/day-004.json`.
2. Add `coding-arena/day-004.json`.
3. Add or reuse required datasets.
4. Update `curriculum/index.json`.
5. Update `coding-arena/index.json`.
6. Update `datasets/index.json` when a dataset is added.
7. Update `manifest.json` so `published_through_day` and `open_days` reflect the release.
8. Commit the complete resource set together.

The frontend should discover published content from GitHub rather than hardcoding future days.

## Data quality rules

When adding or modifying a dataset:

1. Keep `schema.json` synchronized with the CSV.
2. Keep the transaction grain explicit.
3. Use stable column names.
4. Include realistic business dimensions and measures.
5. Include useful edge cases where appropriate.
6. Document keys, grain, and relationships.
7. Update every resource that references the dataset.

## Learner-state architecture

```text
GitHub repository
      │
      ├── curriculum
      ├── coding-arena
      └── datasets
              │
              ▼
       Learning application
              │
              ▼
      Local learner progress
```

GitHub controls **content**. The learner's browser controls **progress**.

## Release policy

Current release:

```text
OPEN       Day 1 → Day 2 → … → Day 10
LOCKED     Day 11 → Day 100
```

A future day should be considered open only when its curriculum resource and required learning resources are actually published.

## Design principles

- **Business-first:** every activity should resemble an organizational request.
- **Scenario-driven:** explain who needs the analysis and why.
- **Executable:** coding tasks should map to real analytical workflows.
- **Deterministic:** validation should be reproducible.
- **Modular:** curriculum, coding tasks, and datasets remain independently maintainable.
- **GitHub-first:** versioned repository resources are authoritative.
- **Offline-friendly:** learner state does not depend on a hosted database.
- **Scalable:** the same content contract should support all 100 days.


## Academy Engine Matrix

The frontend now includes a modular runtime engine layer:

- **Content Engine:** discovers curriculum resources from GitHub indexes.
- **Release Engine:** respects the published-day boundary and release metadata.
- **Progress Engine:** tracks learner completion locally without writing learner state to GitHub.
- **SQL Engine:** runs read-only SQL locally in the browser against the 150-row orders dataset.
- **Code Console:** provides executable SQL practice, result tables, timing, and schema inspection.
- **Engine Manager:** provides a plug-in contract for future Excel, Power BI/DAX, and Python engines.

Heavy execution engines are designed for lazy loading so a future track does not force every learner to download every runtime.
