# AHK Academy Engine Matrix

The frontend is modular. Engines are independently registered with EngineManager.

## Current engines
- Content engine: GitHub curriculum JSON.
- Release engine: published-day boundary and sequential release metadata.
- Progress engine: learner state in localStorage.
- SQL engine: browser-local SQLite through SQL.js, populated from orders/data.csv.

## Extension contract
Future tracks can register adapters such as Excel, DAX and Python without rewriting the academy shell.

## Safety
The SQL practice engine rejects mutating statements and operates only in the learner browser.