const STORAGE_KEY = 'ahk_academy_state_v1';
const LEGACY_TASK_KEY = 'ahk_task_status_v5';

function safeGetItem(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeRead(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function createDefaultState() {
  return {
    schemaVersion: 1,
    activeDay: 1,
    completedDays: [],
    tasks: {},
    updatedAt: new Date().toISOString()
  };
}

function normalizeState(value) {
  const base = createDefaultState();
  if (!value || typeof value !== 'object') return base;
  const completedDays = Array.isArray(value.completedDays)
    ? value.completedDays.map(Number).filter(day => Number.isInteger(day) && day >= 1 && day <= 100)
    : [];
  const tasks = value.tasks && typeof value.tasks === 'object' && !Array.isArray(value.tasks)
    ? value.tasks
    : {};
  const normalizedTasks = {};
  for (const [key, status] of Object.entries(tasks)) {
    if (/^\d+:\d+:\d+$/.test(key) && ['solved', 'attempted'].includes(status)) {
      normalizedTasks[key] = status;
    }
  }
  const activeDay = Number(value.activeDay);
  return {
    schemaVersion: 1,
    activeDay: Number.isInteger(activeDay) ? Math.min(100, Math.max(1, activeDay)) : 1,
    completedDays: [...new Set(completedDays)].sort((a, b) => a - b),
    tasks: normalizedTasks,
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : new Date().toISOString()
  };
}

function migrateLegacyState() {
  const state = createDefaultState();
  const legacyTasks = safeRead(LEGACY_TASK_KEY, {});
  if (legacyTasks && typeof legacyTasks === 'object') {
    for (const [key, status] of Object.entries(legacyTasks)) {
      if (/^\d+:\d+:\d+$/.test(key) && status === 'solved') {
        state.tasks[key] = 'solved';
      } else if (/^\d+:\d+:\d+$/.test(key) && status === 'attempted') {
        state.tasks[key] = 'attempted';
      }
    }
  }
  for (let day = 1; day <= 100; day += 1) {
    if (safeGetItem('ahk_completed_day_' + day) === 'true') {
      state.completedDays.push(day);
    }
  }
  const oldActiveDay = Number(safeGetItem('ahk_active_day_v5'));
  if (Number.isInteger(oldActiveDay) && oldActiveDay >= 1 && oldActiveDay <= 100) {
    state.activeDay = oldActiveDay;
  }
  state.completedDays = [...new Set(state.completedDays)].sort((a, b) => a - b);
  return state;
}

function readInitialState() {
  const current = safeRead(STORAGE_KEY, null);
  if (current) return normalizeState(current);
  const migrated = migrateLegacyState();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
  } catch {
    // The application remains usable for the current session if storage is blocked.
  }
  return migrated;
}

let state = readInitialState();

function persist() {
  state.updatedAt = new Date().toISOString();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

function taskKey(day, topicIndex, questionIndex) {
  return [Number(day), Number(topicIndex), Number(questionIndex)].join(':');
}

export const progressStore = {
  getState() {
    return JSON.parse(JSON.stringify(state));
  },
  setActiveDay(day) {
    const value = Number(day);
    if (Number.isInteger(value) && value >= 1 && value <= 100) {
      state.activeDay = value;
      persist();
    }
  },
  isSolved(day, topicIndex, questionIndex) {
    return state.tasks[taskKey(day, topicIndex, questionIndex)] === 'solved';
  },
  setSolved(day, topicIndex, questionIndex, solved) {
    const key = taskKey(day, topicIndex, questionIndex);
    if (solved) state.tasks[key] = 'solved';
    else delete state.tasks[key];
    persist();
  },
  setAttempted(day, topicIndex, questionIndex) {
    const key = taskKey(day, topicIndex, questionIndex);
    if (state.tasks[key] !== 'solved') state.tasks[key] = 'attempted';
    persist();
  },
  getSolvedCount(day) {
    const prefix = String(Number(day)) + ':';
    return Object.entries(state.tasks).filter(([key, status]) => key.startsWith(prefix) && status === 'solved').length;
  },
  isDayCompleted(day) {
    return state.completedDays.includes(Number(day));
  },
  completeDay(day, requiredQuestions) {
    const target = Number(day);
    if (!Number.isInteger(target) || this.getSolvedCount(target) < Number(requiredQuestions)) {
      return { ok: false, reason: 'Complete every business question before completing this day.' };
    }
    if (!state.completedDays.includes(target)) {
      state.completedDays.push(target);
      state.completedDays.sort((a, b) => a - b);
      persist();
    }
    return { ok: true };
  },
  isDayUnlocked(day, publishedThrough) {
    const target = Number(day);
    const published = Number(publishedThrough);
    if (!Number.isInteger(target) || target < 1 || target > published) return false;
    return target === 1 || state.completedDays.includes(target - 1);
  },
  getStats(publishedThrough, questionsPerDay = 15) {
    const published = Math.max(0, Number(publishedThrough) || 0);
    const publishedQuestions = published * questionsPerDay;
    const solvedQuestions = Object.entries(state.tasks).filter(([key, value]) => Number(key.split(':')[0]) <= published && value === 'solved').length;
    const completedDays = state.completedDays.filter(day => day <= published).length;
    return {
      publishedDays: published,
      publishedQuestions,
      solvedQuestions,
      completedDays,
      courseCompletion: publishedQuestions ? Math.round((solvedQuestions / publishedQuestions) * 100) : 0,
      releaseCompletion: Math.round((published / 100) * 100),
      nextDay: completedDays < published ? Math.min(published, completedDays + 1) : Math.min(100, published + 1)
    };
  },
  reset() {
    state = createDefaultState();
    persist();
  }
};
