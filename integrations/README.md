# External Learning Federation

This layer connects the 100-Day Data Analyst Business Trainer to approved external GitHub learning repositories.

## Rules

- External repositories are **read-only references**.
- The local curriculum remains authoritative for the 100-day sequence, business questions, datasets, validation, and learner progression.
- The application must health-check sources before surfacing them.
- Missing, renamed, archived, or rate-limited external resources must not break local learning.
- Never execute JavaScript, shell commands, notebooks, or binaries fetched from an external repository.
- Preserve source attribution when external material is displayed.
- Do not copy external content into the local curriculum unless its license permits reuse and attribution requirements are satisfied.

## Fixed issues

1. Removed the stale `VIPULbunny/30-days-data-analytics` entry after repository verification failed.
2. Added `Semilore-James/DATA-SCENARIOS` as a verified scenario/assignment reference.
3. Added explicit default branches because the sources do not all use `main`.
4. Added runtime health-check and graceful fallback requirements.
5. Clarified that publication in GitHub, not a time-based midnight unlock, controls future-day availability.

## Current sources

| Repository | Role |
|---|---|
| visualkirby/30-day-data-analyst-learning-curriculum | curriculum reference |
| michaelnocito/analyst-prep-kit | interactive lesson/practice reference |
| firatolcum/Data_Analytics_Course | course-depth reference |
| Semilore-James/DATA-SCENARIOS | scenario and assignment reference |
| pfiterman/DataAnalysis | labs and knowledge reference |
