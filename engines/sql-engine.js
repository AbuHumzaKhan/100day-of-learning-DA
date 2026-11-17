const SQL_JS_VERSION = '1.13.0';
const SQL_CDN_BASE = `https://cdn.jsdelivr.net/npm/sql.js@${SQL_JS_VERSION}/dist/`;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = [...document.scripts].find(script => script.src === src);
    if (existing) {
      if (window.initSqlJs) resolve();
      else {
        existing.addEventListener('load', resolve, { once: true });
        existing.addEventListener('error', () => reject(new Error('SQL runtime could not be loaded.')), { once: true });
      }
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error('SQL runtime could not be loaded from the configured CDN.'));
    document.head.appendChild(script);
  });
}

function parseCsv(source) {
  const text = String(source || '').replace(/^\uFEFF/, '');
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i += 1; }
      else quoted = !quoted;
    } else if (char === ',' && !quoted) {
      row.push(cell); cell = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      row.push(cell);
      if (row.some(value => value !== '')) rows.push(row);
      row = []; cell = '';
    } else {
      cell += char;
    }
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  const headers = (rows.shift() || []).map(header => header.trim());
  return { headers, rows: rows.map(values => headers.map((_, index) => values[index] ?? '')) };
}

function quoteIdentifier(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function inferSqlType(name, declaredType = '') {
  const type = String(declaredType).toLowerCase();
  if (/int|integer|bool/.test(type) || /(^row_no$|quantity|count|year|month)/i.test(name)) return 'INTEGER';
  if (/real|decimal|numeric|float|double/.test(type) || /sales|profit|discount|price|margin|cost|amount|revenue/i.test(name)) return 'REAL';
  return 'TEXT';
}

function coerce(value, type) {
  if (value === '') return null;
  if (type === 'INTEGER' || type === 'REAL') {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }
  return value;
}

export class SQLEngine {
  constructor() {
    this.SQL = null;
    this.db = null;
    this.ready = false;
    this.schemas = new Map();
    this.datasetRegistry = null;
    this.rowLimit = 500;
  }

  async init() {
    if (this.ready) return;
    if (!window.initSqlJs) await loadScript(SQL_CDN_BASE + 'sql-wasm.js');
    this.SQL = await window.initSqlJs({ locateFile: file => SQL_CDN_BASE + file });
    const registryResponse = await fetch(new URL('./datasets/index.json', window.location.href));
    if (!registryResponse.ok) throw new Error('Dataset registry could not be loaded.');
    this.datasetRegistry = await registryResponse.json();
    this.db = new this.SQL.Database();
    for (const dataset of this.datasetRegistry.datasets || []) {
      if (dataset.status && dataset.status !== 'active') continue;
      await this.loadDataset(dataset);
    }
    this.db.run('PRAGMA query_only = ON;');
    this.ready = true;
  }

  async loadDataset(dataset) {
    const [schemaResponse, csvResponse] = await Promise.all([
      fetch(new URL(`./${dataset.schema}`, window.location.href)),
      fetch(new URL(`./${dataset.data}`, window.location.href))
    ]);
    if (!schemaResponse.ok || !csvResponse.ok) throw new Error(`Dataset "${dataset.id}" could not be loaded.`);
    const schema = await schemaResponse.json();
    const parsed = parseCsv(await csvResponse.text());
    if (!parsed.headers.length) throw new Error(`Dataset "${dataset.id}" has no columns.`);
    const declared = new Map((schema.columns || []).map(column => Array.isArray(column) ? [column[0], column[1]] : [column.name, column.type]));
    const columns = parsed.headers.map(name => ({ name, type: inferSqlType(name, declared.get(name)) }));
    const tableName = String(dataset.table || dataset.id).replace(/[^a-zA-Z0-9_]/g, '_');
    const createSql = `CREATE TABLE ${quoteIdentifier(tableName)} (${columns.map(column => `${quoteIdentifier(column.name)} ${column.type}`).join(', ')})`;
    this.db.run(createSql);
    const insert = this.db.prepare(`INSERT INTO ${quoteIdentifier(tableName)} VALUES (${columns.map(() => '?').join(', ')})`);
    try {
      for (const row of parsed.rows) insert.run(columns.map((column, index) => coerce(row[index], column.type)));
    } finally {
      insert.free();
    }
    this.schemas.set(dataset.id, { id: dataset.id, table: tableName, name: dataset.name, columns, rowCount: parsed.rows.length, rows: parsed.rows });
  }

  listDatasets() {
    return (this.datasetRegistry?.datasets || []).filter(dataset => !dataset.status || dataset.status === 'active').map(dataset => ({ id: dataset.id, name: dataset.name, rowCount: this.schemas.get(dataset.id)?.rowCount || dataset.row_count || 0 }));
  }

  getSchema(datasetId) {
    const schema = this.schemas.get(datasetId);
    if (!schema) throw new Error(`Dataset "${datasetId}" is not loaded.`);
    return { id: schema.id, table: schema.table, name: schema.name, columns: schema.columns, rowCount: schema.rowCount, sampleRows: schema.rows.slice(0, 8) };
  }

  run(query) {
    if (!this.ready || !this.db) throw new Error('The SQL engine is not ready yet.');
    const sql = String(query || '').trim();
    if (!sql) throw new Error('Write a SQL query first.');
    if (!/^(SELECT|WITH)\b/i.test(sql)) throw new Error('Read-only practice accepts SELECT queries and SELECT-based CTEs only.');
    if (/\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|ATTACH|DETACH|REINDEX|VACUUM|REPLACE|PRAGMA|ANALYZE)\b/i.test(sql)) throw new Error('This practice database is read-only. Data-changing statements are blocked.');
    const withoutTrailingSemicolon = sql.replace(/;\s*$/, '');
    if (/;/.test(withoutTrailingSemicolon)) throw new Error('Only one SQL statement can be executed at a time.');
    const started = performance.now();
    const result = this.db.exec(sql);
    const elapsed = Math.round(performance.now() - started);
    if (!result.length) return { columns: [], rows: [], elapsed };
    const first = result[0];
    const rows = first.values.slice(0, this.rowLimit).map(values => Object.fromEntries(first.columns.map((column, index) => [column, values[index]])));
    return { columns: first.columns, rows, totalRows: first.values.length, truncated: first.values.length > this.rowLimit, elapsed };
  }
}
