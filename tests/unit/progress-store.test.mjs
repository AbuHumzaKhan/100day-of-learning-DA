import test from 'node:test';
import assert from 'node:assert/strict';
import { createProgressStore } from '../../assets/js/core/progress-store.js';

class MemoryStorage {
  constructor(seed = {}) { this.values = new Map(Object.entries(seed)); }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

test('only Day 1 is initially unlocked', () => {
  const store = createProgressStore(new MemoryStorage());
  assert.equal(store.canOpenDay(1, 11), true);
  assert.equal(store.canOpenDay(2, 11), false);
  assert.equal(store.canOpenDay(12, 11), false);
});

test('completion requires an attempted task', () => {
  const store = createProgressStore(new MemoryStorage());
  assert.throws(() => store.setTaskCompleted(1, 0, 0, true), /successful practice query/i);
  store.markAttempted(1, 0, 0);
  store.setTaskCompleted(1, 0, 0, true);
  assert.equal(store.getTaskStatus(1, 0, 0), 'completed');
});

test('a day unlocks the next day only after all required tasks are complete', () => {
  const store = createProgressStore(new MemoryStorage());
  for (let topic = 0; topic < 5; topic += 1) {
    for (let question = 0; question < 3; question += 1) {
      store.markAttempted(1, topic, question);
      store.setTaskCompleted(1, topic, question, true);
    }
  }
  assert.equal(store.countCompletedTasks(1), 15);
  assert.throws(() => store.completeDay(1, 16), /Complete all 16 tasks/);
  store.completeDay(1, 15);
  assert.equal(store.canOpenDay(2, 11), true);
  assert.equal(store.isDayCompleted(1), true);
});

test('legacy task progress is migrated and non-sequential day flags are ignored', () => {
  const storage = new MemoryStorage({
    ahk_task_status_v5: JSON.stringify({ '1:0:0': 'solved', '1:0:1': 'attempted' }),
    ahk_completed_day_1: 'true',
    ahk_completed_day_3: 'true'
  });
  const store = createProgressStore(storage);
  assert.equal(store.getTaskStatus(1, 0, 0), 'completed');
  assert.equal(store.getTaskStatus(1, 0, 1), 'attempted');
  assert.equal(store.isDayCompleted(1), true);
  assert.equal(store.isDayCompleted(3), false);
  assert.equal(store.canOpenDay(2, 11), true);
  assert.equal(store.canOpenDay(4, 11), false);
});

test('progress backup exports and imports the versioned state', () => {
  const first = createProgressStore(new MemoryStorage());
  first.markAttempted(1, 0, 0);
  const backup = first.exportJson();
  const second = createProgressStore(new MemoryStorage());
  second.importJson(backup);
  assert.equal(second.getTaskStatus(1, 0, 0), 'attempted');
  assert.throws(() => second.importJson('{"schemaVersion":99}'), /valid AHK Academy progress backup/i);
});
