import fs from 'node:fs';
import path from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';

const readJSON = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const fail = message => {
  console.error('Content validation failed: ' + message);
  process.exitCode = 1;
};

const manifest = readJSON('manifest.json');
const index = readJSON('curriculum/index.json');
const registry = readJSON('datasets/index.json');
const schema = readJSON('schemas/curriculum-day.schema.json');
const ajv = new Ajv2020({ allErrors: true, strict: false });
const validateDay = ajv.compile(schema);
const published = Number(manifest.release_control?.published_through_day || 0);
const expectedDays = Array.from({ length: published }, (_, position) => position + 1);

if (published < 1 || published > 100) fail('published_through_day must be between 1 and 100.');
if (Number(index.published_through_day) !== published) fail('Manifest and curriculum index publication counts differ.');
if (JSON.stringify(manifest.release_control.open_days) !== JSON.stringify(expectedDays)) fail('Manifest open_days must be sequential from 1 through published_through_day.');
if (JSON.stringify(index.open_days) !== JSON.stringify(expectedDays)) fail('Curriculum index open_days must match the manifest.');
if ((index.days || []).length !== published) fail('Curriculum index must contain every published day exactly once.');

const datasetIds = new Set((registry.datasets || []).map(dataset => dataset.id));
const seenQuestionIds = new Set();
const seenCodingQuestionIds = new Set();

for (const dayNumber of expectedDays) {
  const meta = index.days.find(item => Number(item.day) === dayNumber);
  if (!meta) {
    fail('Missing index metadata for Day ' + dayNumber + '.');
    continue;
  }
  const file = path.join('curriculum', meta.file);
  if (!fs.existsSync(file)) {
    fail('Missing curriculum file: ' + file);
    continue;
  }
  const day = readJSON(file);
  if (!validateDay(day)) {
    fail(file + ': ' + ajv.errorsText(validateDay.errors, { separator: '; ' }));
    continue;
  }
  if (Number(day.day) !== dayNumber) fail(file + ': day number does not match its filename/index.');
  if (Number(meta.topics) !== day.topics.length) fail(file + ': index topic count is incorrect.');
  const questionCount = day.topics.reduce((sum, topic) => sum + topic.questions.length, 0);
  if (questionCount !== Number(meta.business_questions)) fail(file + ': index question count is incorrect.');
  if (questionCount !== 15) fail(file + ': expected exactly 15 business questions.');

  for (const datasetId of day.dataset_refs || []) {
    if (!datasetIds.has(datasetId)) fail(file + ': unregistered dataset reference ' + datasetId + '.');
  }
  let codingQuestionCount = 0;
  for (const topic of day.topics) {
    if (!Array.isArray(topic.coding_questions) || topic.coding_questions.length !== 5) {
      fail(file + ': every topic must contain exactly five coding questions.');
      continue;
    }
    codingQuestionCount += topic.coding_questions.length;
    for (const codingQuestion of topic.coding_questions) {
      if (!codingQuestion.expected_sql || !codingQuestion.prompt || !codingQuestion.starter_sql) {
        fail(file + ': coding questions require a prompt, starter SQL, and reference SQL.');
      }
      if (seenCodingQuestionIds.has(codingQuestion.id)) fail('Duplicate coding question ID: ' + codingQuestion.id);
      seenCodingQuestionIds.add(codingQuestion.id);
    }
    for (const question of topic.questions) {
      if (question.id) {
        if (seenQuestionIds.has(question.id)) fail('Duplicate question ID: ' + question.id);
        seenQuestionIds.add(question.id);
      }
    }
  }
  if (codingQuestionCount !== 25) fail(file + ': expected exactly 25 coding questions (five per topic).');
}

for (const dataset of registry.datasets || []) {
  for (const key of ['data', 'schema', 'documentation']) {
    if (dataset[key] && !fs.existsSync(dataset[key])) fail('Dataset ' + dataset.id + ' is missing ' + dataset[key] + '.');
  }
  if (dataset.schema && dataset.data && fs.existsSync(dataset.schema) && fs.existsSync(dataset.data)) {
    const schemaData = readJSON(dataset.schema);
    const csv = fs.readFileSync(dataset.data, 'utf8').replace(/^\uFEFF/, '');
    const headers = (csv.split(/\r?\n/, 1)[0] || '').split(',').map(value => value.trim());
    const schemaColumns = (schemaData.columns || []).map(column => Array.isArray(column) ? column[0] : column.name);
    if (JSON.stringify(headers) !== JSON.stringify(schemaColumns)) fail('Dataset ' + dataset.id + ' CSV headers do not match its schema.');
    const rowCount = Math.max(0, csv.trim().split(/\r?\n/).length - 1);
    if (Number(dataset.row_count) !== rowCount) fail('Dataset ' + dataset.id + ' declared row count ' + dataset.row_count + ' differs from CSV row count ' + rowCount + '.');
  }
}

if (process.exitCode) process.exit(process.exitCode);
console.log('Validated ' + published + ' published curriculum days, ' + seenQuestionIds.size + ' unique business question IDs, ' + seenCodingQuestionIds.size + ' unique coding question IDs, and ' + (registry.datasets || []).length + ' registered datasets.');
