const STORAGE_KEY = 'ahk_academy_state_v1';
const LEGACY_TASK_KEY = 'ahk_task_status_v5';

function readJson(storage, key, fallback) {
  try {
    const raw = storage?.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function normalizeState(value) {
  const state = value && typeof value === 'object' ? value : {};
  const listedDays = [...new Set((Array.isArray(state.completedDays) ? state.completedDays : []).map(Number).filter(n => Number.isInteger(n) && n >= 1 && n <= 100))].sort((a, b) => a - b);
  const completedDays = [];
  for (const day of listedDays) {
    if (day !== completedDays.length + 1) break;
    completedDays.push(day);
  }
  return {
    schemaVersion: 1,
    activeDay: Number.isInteger(Number(state.activeDay)) ? Math.max(1, Number(state.activeDay)) : 1,
    completedDays,
    tasks: state.tasks && typeof state.tasks === 'object' && !Array.isArray(state.tasks) ? state.tasks : {},
    updatedAt: state.updatedAt || new Date().toISOString()
  };
}

function migrateLegacy(storage) {
  const next = normalizeState({});
  const legacyTasks = readJson(storage, LEGACY_TASK_KEY, {});
  for (const [key, value] of Object.entries(legacyTasks || {})) {
    if (value === 'solved' || value === true) next.tasks[key] = 'completed';
    else if (value === 'attempted') next.tasks[key] = 'attempted';
  }
  const oldActiveDay = Number(storage?.getItem('ahk_active_day_v5'));
  if (Number.isInteger(oldActiveDay) && oldActiveDay >= 1 && oldActiveDay <= 100) next.activeDay = oldActiveDay;
  for (let day = 1; day <= 100; day += 1) {
    if (storage?.getItem(`ahk_completed_day_${day}`) === 'true') next.completedDays.push(day);
  }
  for (const legacyKey of ['ahk_da_progress', 'ahk_da_progress_v2']) {
    const oldProgress = readJson(storage, legacyKey, {});
    for (const [key, value] of Object.entries(oldProgress || {})) {
      if (!(value === true || value?.completed === true)) continue;
      // Earlier releases used curriculum IDs such as sql-d1-t1-q1 instead of numeric keys.
      const match = key.match(/(?:^|-)d(\d+)-t(\d+)-q(\d+)$/i);
      const migratedKey = match ? `${Number(match[1])}:${Number(match[2]) - 1}:${Number(match[3]) - 1}` : key;
      if (!next.tasks[migratedKey]) next.tasks[migratedKey] = 'completed';
    }
  }
  next.completedDays = [...new Set(next.completedDays)].sort((a, b) => a - b);
  return next;
}

export function createProgressStore(storage = globalThis.localStorage) {
  let state = normalizeState(readJson(storage, STORAGE_KEY, null) || migrateLegacy(storage));

  function persist() {
    state.updatedAt = new Date().toISOString();
    try {
      storage?.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      console.warn('Could not persist learner progress.', error);
    }
  }

  function taskKey(day, topicIndex, questionIndex) {
    return `${day}:${topicIndex}:${questionIndex}`;
  }

  return {
    getState: () => structuredClone(state),
    getTaskStatus: (day, topicIndex, questionIndex) => state.tasks[taskKey(day, topicIndex, questionIndex)] || 'not_started',
    markAttempted(day, topicIndex, questionIndex) {
      const key = taskKey(day, topicIndex, questionIndex);
      if (state.tasks[key] !== 'completed') state.tasks[key] = 'attempted';
      persist();
    },
    setTaskCompleted(day, topicIndex, questionIndex, completed) {
      const key = taskKey(day, topicIndex, questionIndex);
      if (completed && state.tasks[key] !== 'attempted' && state.tasks[key] !== 'completed') {
        throw new Error('Run a successful practice query before marking this task complete.');
      }
      state.tasks[key] = completed ? 'completed' : 'not_started';
      persist();
    },
    countCompletedTasks(day) {
      const prefix = `${day}:`;
      return Object.entries(state.tasks).filter(([key, status]) => key.startsWith(prefix) && status === 'completed').length;
    },
    countAttemptedTasks(day) {
      const prefix = `${day}:`;
      return Object.entries(state.tasks).filter(([key, status]) => key.startsWith(prefix) && (status === 'attempted' || status === 'completed')).length;
    },
    isDayCompleted(day) {
      return state.completedDays.includes(Number(day));
    },
    canOpenDay(day, publishedThrough) {
      const n = Number(day);
      return Number.isInteger(n) && n >= 1 && n <= Number(publishedThrough) && (n === 1 || state.completedDays.includes(n - 1));
    },
    completeDay(day, totalTasks) {
      const n = Number(day);
      if (!this.canOpenDay(n, 100)) throw new Error(`Complete the previous day before completing Day ${n}.`);
      if (this.countCompletedTasks(n) < totalTasks) throw new Error(`Complete all ${totalTasks} tasks before completing this day.`);
      if (!state.completedDays.includes(n)) state.completedDays.push(n);
      state.completedDays.sort((a, b) => a - b);
      state.activeDay = Math.min(100, n + 1);
      persist();
    },
    setActiveDay(day) {
      state.activeDay = Math.max(1, Math.min(100, Number(day) || 1));
      persist();
    },
    exportJson() {
      return JSON.stringify({ ...state, exportedAt: new Date().toISOString() }, null, 2);
    },
    importJson(json) {
      const parsed = JSON.parse(json);
      if (parsed?.schemaVersion !== 1 || !parsed.tasks || !Array.isArray(parsed.completedDays)) {
        throw new Error('This is not a valid AHK Academy progress backup.');
      }
      state = normalizeState(parsed);
      persist();
    },
    reset() {
      state = normalizeState({});
      persist();
    }
  };
}
