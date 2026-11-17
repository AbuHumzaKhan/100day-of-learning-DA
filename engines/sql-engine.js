const SQL_JS_VERSION = '1.13.0';
const CDN_BASE = 'https://cdn.jsdelivr.net/npm/sql.js@' + SQL_JS_VERSION + '/dist/';
const RESULT_LIMIT = 300;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-sqljs]');
    if (existing && window.initSqlJs) return resolve();
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.dataset.sqljs = 'true';
    script.onload = resolve;
    script.onerror = () => {
      script.remove();
      reject(new Error('SQL.js could not be loaded. Check your connection and retry.'));
    };
    document.head.appendChild(script);
  });
}

function parseCSV(source) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const input = String(source || '').replace(/^\uFEFF/, '');
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (char === '"') {
      if (quoted && input[i + 1] === '"') {
        field += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === ',' && !quoted) {
      row.push(field);
      field = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && input[i + 1] === '\n') i += 1;
      row.push(field);
      if (row.some(value => value !== '')) rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }
  if (field !== '' || row.length) {
    row.push(field);
    if (row.some(value => value !== '')) rows.push(row);
  }
  if (!rows.length) return { headers: [], rows: [] };
  const headers = rows.shift().map(value => value.trim());
  return { headers, rows: rows.map(values => headers.map((_, index) => values[index] ?? '')) };
}

function sqlIdentifier(value) {
  return '"' + String(value).replace(/"/g, '""') + '"';
}

function tableName(id) {
  return String(id).replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
}

function typeFor(schema, columnName) {
  const item = (schema?.columns || []).find(column => Array.isArray(column) ? column[0] === columnName : column?.name === columnName);
  const type = Array.isArray(item) ? item[1] : item?.type;
  const normalized = String(type || '').toLowerCase();
  if (/int|number|whole/.test(normalized)) return 'INTEGER';
  if (/real|decimal|float|numeric/.test(normalized)) return 'REAL';
  return 'TEXT';
}

function castValue(value, type) {
  if (value === '') return null;
  if (type === 'INTEGER' || type === 'REAL') {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }
  return value;
}

async function fetchJson(path) {
  const response = await fetch('./' + path, { cache: 'no-store' });
  if (!response.ok) throw new Error(path + ' · HTTP ' + response.status);
  return response.json();
}

async function fetchText(path) {
  const response = await fetch('./' + path, { cache: 'no-store' });
  if (!response.ok) throw new Error(path + ' · HTTP ' + response.status);
  return response.text();
}

export class SQLEngine {
  constructor() {
    this.SQL = null;
    this.db = null;
    this.ready = false;
    this.datasets = [];
    this.schemas = new Map();
    this.tableNames = new Map();
  }

  async init() {
    if (this.ready) return;
    if (!window.initSqlJs) await loadScript(CDN_BASE + 'sql-wasm.js');
    this.SQL = await window.initSqlJs({
      locateFile: file => CDN_BASE + file
    });

    const registry = await fetchJson('datasets/index.json');
    const activeDatasets = (registry.datasets || []).filter(dataset => dataset.status !== 'disabled');
    if (!activeDatasets.length) throw new Error('No active datasets are registered.');

    this.db = new this.SQL.Database();
    for (const dataset of activeDatasets) {
      const [schema, csv] = await Promise.all([
        fetchJson(dataset.schema),
        fetchText(dataset.data)
      ]);
      const parsed = parseCSV(csv);
      if (!parsed.headers.length) throw new Error('Dataset is empty: ' + dataset.name);
      const name = tableName(dataset.id);
      const types = parsed.headers.map(column => typeFor(schema, column));
      const definitions = parsed.headers.map((column, index) => sqlIdentifier(column) + ' ' + types[index]);
      this.db.run('CREATE TABLE ' + sqlIdentifier(name) + ' (' + definitions.join(', ') + ')');
      const statement = this.db.prepare('INSERT INTO ' + sqlIdentifier(name) + ' VALUES (' + parsed.headers.map(() => '?').join(', ') + ')');
      try {
        for (const values of parsed.rows) {
          statement.run(values.map((value, index) => castValue(value, types[index])));
        }
      } finally {
        statement.free();
      }
      this.datasets.push({
        id: dataset.id,
        name: dataset.name,
        table: name,
        rowCount: parsed.rows.length,
        columns: parsed.headers
      });
      this.schemas.set(dataset.id, schema);
      this.tableNames.set(dataset.id, name);
    }

    this.db.run('PRAGMA query_only = ON');
    this.ready = true;
  }

  async run(query) {
    await this.init();
    const clean = String(query || '').trim().replace(/;\s*$/, '');
    if (!clean) throw new Error('Enter a SQL query.');
    if (clean.includes(';')) throw new Error('Run one SQL statement at a time.');
    if (!/^(SELECT|WITH)\b/i.test(clean)) {
      throw new Error('The learning workspace accepts SELECT and WITH queries only.');
    }

    const started = performance.now();
    const results = this.db.exec(clean);
    const elapsed = Math.round(performance.now() - started);
    if (!results.length) {
      return { columns: [], values: [], rows: [], totalRows: 0, elapsed };
    }
    const first = results[0];
    const totalRows = first.values.length;
    const values = first.values.slice(0, RESULT_LIMIT);
    const rows = values.map(valuesRow => Object.fromEntries(first.columns.map((column, index) => [column, valuesRow[index]])));
    return {
      columns: first.columns,
      values,
      rows,
      totalRows,
      truncated: totalRows > RESULT_LIMIT,
      elapsed
    };
  }


  async validate(query, expectedQuery, options = {}) {
    const actual = await this.run(query);
    const expected = await this.run(expectedQuery);
    const normalizeValue = value => {
      if (typeof value === 'number' && Number.isFinite(value)) return Number(value.toFixed(7));
      return value;
    };
    const normalizeRows = result => result.values.map(row => JSON.stringify(row.map(normalizeValue)));
    const actualColumns = actual.columns.map(column => String(column).toLowerCase());
    const expectedColumns = expected.columns.map(column => String(column).toLowerCase());
    const columnsMatch = actualColumns.length === expectedColumns.length &&
      actualColumns.every((column, index) => column === expectedColumns[index]);
    let actualRows = normalizeRows(actual);
    let expectedRows = normalizeRows(expected);
    if (!options.orderSensitive) {
      actualRows = actualRows.sort();
      expectedRows = expectedRows.sort();
    }
    const rowsMatch = actualRows.length === expectedRows.length &&
      actualRows.every((row, index) => row === expectedRows[index]);
    return {
      passed: columnsMatch && rowsMatch,
      columnsMatch,
      rowsMatch,
      actual,
      expectedColumns: expected.columns,
      expectedRowCount: expected.totalRows,
      orderSensitive: options.orderSensitive === true
    };
  }

  getDatasets() {
    return this.datasets.map(dataset => ({ ...dataset, columns: [...dataset.columns] }));
  }

  getSchema(datasetId) {
    const dataset = this.datasets.find(item => item.id === datasetId);
    const schema = this.schemas.get(datasetId);
    if (!dataset || !schema) throw new Error('Unknown dataset: ' + datasetId);
    return {
      ...dataset,
      schema,
      columns: dataset.columns.map(column => ({
        name: column,
        type: typeFor(schema, column)
      }))
    };
  }

  async getPreview(datasetId, limit = 8) {
    await this.init();
    const dataset = this.getSchema(datasetId);
    const result = this.db.exec('SELECT * FROM ' + sqlIdentifier(dataset.table) + ' LIMIT ' + Math.min(50, Math.max(1, Number(limit) || 8)));
    return {
      columns: dataset.columns,
      rows: result.length ? result[0].values : []
    };
  }
}
