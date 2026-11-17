import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = relative => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
const fail = message => { throw new Error(message); };
const manifest = readJson('manifest.json');
const index = readJson('curriculum/index.json');
const datasetIndex = readJson('datasets/index.json');
const schema = readJson('schemas/curriculum-day.schema.json');

if (Number(manifest.release_control.published_through_day) !== Number(index.published_through_day)) fail('Manifest and curriculum index published-day values differ.');
if (JSON.stringify(manifest.release_control.open_days) !== JSON.stringify(index.open_days)) fail('Manifest and curriculum index open-day arrays differ.');
if (schema.$schema !== 'https://json-schema.org/draft/2020-12/schema') fail('Curriculum schema must use JSON Schema 2020-12.');

const datasetIds = new Set((datasetIndex.datasets || []).map(dataset => dataset.id));
for (const day of index.open_days) {
  const meta = index.days.find(item => Number(item.day) === Number(day));
  if (!meta) fail(`Day ${day} is marked open but missing from curriculum index.`);
  const file = `curriculum/${meta.file}`;
  if (!fs.existsSync(path.join(root, file))) fail(`Missing published curriculum file: ${file}`);
  const curriculum = readJson(file);
  if (Number(curriculum.day) !== Number(day)) fail(`${file} contains the wrong day number.`);
  if (!Array.isArray(curriculum.topics) || curriculum.topics.length !== 5) fail(`${file} must contain exactly five topics.`);
  const questionIds = new Set();
  for (const [topicIndex, topic] of curriculum.topics.entries()) {
    if (!topic.title) fail(`${file}, topic ${topicIndex + 1} is missing a title.`);
    if (!Array.isArray(topic.questions) || topic.questions.length !== 3) fail(`${file}, topic ${topicIndex + 1} must contain exactly three questions.`);
    for (const question of topic.questions) {
      if (!question.id || !question.role || !question.scenario || !question.request) fail(`${file} contains a question missing required fields.`);
      if (questionIds.has(question.id)) fail(`${file} contains duplicate question ID ${question.id}.`);
      questionIds.add(question.id);
    }
  }
  for (const reference of curriculum.dataset_refs || []) {
    if (!datasetIds.has(reference)) fail(`${file} references unknown dataset "${reference}".`);
  }
}

for (const dataset of datasetIndex.datasets || []) {
  for (const relative of [dataset.data, dataset.schema, dataset.documentation].filter(Boolean)) {
    if (!fs.existsSync(path.join(root, relative))) fail(`Dataset ${dataset.id} references missing file ${relative}.`);
  }
  const datasetSchema = readJson(dataset.schema);
  const csv = fs.readFileSync(path.join(root, dataset.data), 'utf8').replace(/^\uFEFF/, '').trim().split(/\r?\n/);
  const headers = csv[0].split(',').map(value => value.trim());
  const declared = (datasetSchema.columns || []).map(column => Array.isArray(column) ? column[0] : column.name);
  if (JSON.stringify(headers) !== JSON.stringify(declared)) fail(`CSV headers do not match ${dataset.id}/schema.json.`);
  const rows = Math.max(0, csv.length - 1);
  if (Number(dataset.row_count) !== rows) fail(`Dataset ${dataset.id} row count mismatch: index=${dataset.row_count}, file=${rows}.`);
  if (Number(datasetSchema.row_count) !== rows) fail(`Dataset ${dataset.id} schema row count mismatch: schema=${datasetSchema.row_count}, file=${rows}.`);
}

for (const required of ['index.html', 'assets/css/app.css', 'assets/js/app.js', 'assets/js/core/progress-store.js', 'assets/js/core/curriculum-service.js', 'engines/sql-engine.js', 'sw.js']) {
  if (!fs.existsSync(path.join(root, required))) fail(`Required application file missing: ${required}.`);
}

console.log(`Repository validation passed: ${index.open_days.length} published days, ${index.open_days.length * 5} topics, ${index.open_days.length * 15} learning tasks, ${(datasetIndex.datasets || []).length} datasets.`);
