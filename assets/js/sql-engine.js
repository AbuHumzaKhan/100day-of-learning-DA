export class SQLAcademyEngine {
  constructor(rows = []) { this.rows = rows; }

  run({ sql }) {
    const q = String(sql || "").trim().replace(/;$/, "");
    if (!/^select\s/i.test(q)) throw new Error("Read-only engine: start with SELECT.");
    if (/\b(insert|update|delete|drop|alter|create|truncate|replace)\b/i.test(q)) throw new Error("Write operations are disabled.");
    const match = q.match(/^select\s+(.+?)\s+from\s+([a-z_][\w]*)(?:\s+where\s+(.+?))?(?:\s+group\s+by\s+(.+?))?(?:\s+order\s+by\s+(.+?))?$/i);
    if (!match) throw new Error("Supported: SELECT ... FROM orders [WHERE] [GROUP BY] [ORDER BY].");
    if (match[2].toLowerCase() !== "orders") throw new Error("Available table: orders.");

    let data = this.rows.map(row => ({ ...row }));
    if (match[3]) data = data.filter(row => this.where(match[3], row));
    const hasAggregate = /\b(sum|avg|count|min|max)\s*\(/i.test(match[1]);
    data = (match[4] || hasAggregate) ? this.aggregate(data, match[1], match[4]) : data.map(row => this.project(row, match[1]));
    if (match[5]) this.sort(data, match[5]);

    return { columns: data.length ? Object.keys(data[0]) : this.columns(match[1]), rows: data.slice(0, 500) };
  }

  columns(selection) {
    return selection.split(",").map(token => token.trim().replace(/\s+as\s+.+$/i, "").replace(/^.*\./, ""));
  }

  project(row, selection) {
    const result = {};
    selection.split(",").forEach(token => {
      const expression = token.trim();
      const alias = expression.match(/^([\w.]+)\s+as\s+([\w]+)$/i);
      const key = alias ? alias[1].split(".").pop() : expression.split(".").pop();
      result[alias ? alias[2] : key] = row[key];
    });
    return result;
  }

  where(expression, row) {
    const parts = expression.split(/\s+(AND|OR)\s+/i);
    let result = this.condition(parts[0], row);
    for (let i = 1; i < parts.length; i += 2) {
      const next = this.condition(parts[i + 1], row);
      result = parts[i].toUpperCase() === "AND" ? result && next : result || next;
    }
    return result;
  }

  condition(condition, row) {
    const match = condition.trim().match(/^([\w.]+)\s*(=|!=|<>|>=|<=|>|<|LIKE|IN)\s*(.+)$/i);
    if (!match) throw new Error("Unsupported WHERE condition: " + condition);
    const field = match[1].split(".").pop();
    const operator = match[2].toUpperCase();
    const rawValue = match[3].trim();
    const actual = row[field];
    const unquote = value => value.replace(/^["']|["']$/g, "");

    if (operator === "LIKE") {
      const pattern = unquote(rawValue).replace(/[.*+?^\${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*").replace(/_/g, ".");
      return new RegExp("^" + pattern + "$", "i").test(String(actual));
    }
    if (operator === "IN") {
      return rawValue.replace(/^\(|\)$/g, "").split(",").map(value => unquote(value.trim())).includes(String(actual));
    }

    const clean = unquote(rawValue);
    const expected = Number.isNaN(Number(clean)) ? clean : Number(clean);
    if (operator === "=") return String(actual) === String(expected);
    if (operator === "!=" || operator === "<>") return String(actual) !== String(expected);
    if (operator === ">") return Number(actual) > Number(expected);
    if (operator === "<") return Number(actual) < Number(expected);
    if (operator === ">=") return Number(actual) >= Number(expected);
    return Number(actual) <= Number(expected);
  }

  aggregate(data, selection, groupBy) {
    const groups = groupBy ? groupBy.split(",").map(value => value.trim().split(".").pop()) : [null];
    const grouped = new Map();

    data.forEach(row => {
      const key = groups.map(group => group ? String(row[group]) : "__all__").join("|");
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(row);
    });

    const output = [];
    grouped.forEach(rows => {
      const result = {};
      if (groups[0]) groups.forEach(group => { result[group] = rows[0][group]; });

      selection.split(",").forEach(token => {
        const aggregate = token.trim().match(/(sum|avg|count|min|max)\s*\(\s*([\w.]+|\*)\s*\)/i);
        const alias = token.match(/\s+as\s+([\w]+)/i);
        if (!aggregate) return;

        const fn = aggregate[1].toLowerCase();
        const field = aggregate[2].split(".").pop();
        const name = alias ? alias[1] : aggregate[0];
        const values = field === "*" ? rows.map(() => 1) : rows.map(row => Number(row[field]) || 0);

        let value;
        if (fn === "sum") value = values.reduce((a, b) => a + b, 0);
        else if (fn === "avg") value = values.reduce((a, b) => a + b, 0) / values.length;
        else if (fn === "count") value = rows.length;
        else if (fn === "min") value = Math.min(...values);
        else value = Math.max(...values);

        result[name] = Number.isInteger(value) ? value : Number(value.toFixed(2));
      });
      output.push(result);
    });
    return output;
  }

  sort(data, expression) {
    const match = expression.split(",")[0].trim().match(/^([\w.]+)(?:\s+(ASC|DESC))?$/i);
    if (!match) return;

    const field = match[1].split(".").pop();
    const direction = (match[2] || "ASC").toUpperCase();

    data.sort((a, b) => {
      const av = a[field], bv = b[field];
      if (typeof av === "number" && typeof bv === "number") return direction === "DESC" ? bv - av : av - bv;
      const comparison = String(av ?? "").localeCompare(String(bv ?? ""));
      return direction === "DESC" ? -comparison : comparison;
    });
  }
}
