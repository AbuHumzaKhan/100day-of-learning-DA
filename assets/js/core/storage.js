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
    schemaVersion: 2,
    activeDay: 1,
    completedDays: [],
    completedLessons: {},
    exams: {},
    tasks: {},
    updatedAt: new Date().toISOString()
  };
}

function normalizeCompletedLessons(value) {
  const result = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return result;
  for (const [dayKey, lessonIndexes] of Object.entries(value)) {
    const day = Number(dayKey);
    if (!Number.isInteger(day) || day < 1 || day > 100 || !Array.isArray(lessonIndexes)) continue;
    result[day] = [...new Set(lessonIndexes.map(Number).filter(index => Number.isInteger(index) && index >= 0 && index < 5))].sort((a, b) => a - b);
  }
  return result;
}

function normalizeExams(value) {
  const result = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return result;
  for (const [dayKey, exam] of Object.entries(value)) {
    const day = Number(dayKey);
    if (!Number.isInteger(day) || day < 1 || day > 100 || !exam || typeof exam !== 'object') continue;
    const answers = {};
    if (exam.answers && typeof exam.answers === 'object' && !Array.isArray(exam.answers)) {
      for (const [questionKey, optionValue] of Object.entries(exam.answers)) {
        const question = Number(questionKey);
        const option = Number(optionValue);
        if (Number.isInteger(question) && question >= 0 && question < 5 && Number.isInteger(option) && option >= 0 && option < 4) {
          answers[question] = option;
        }
      }
    }
    const score = Number(exam.score);
    result[day] = {
      answers,
      submitted: exam.submitted === true,
      score: exam.score == null ? null : Number.isInteger(score) && score >= 0 && score <= 5 ? score : null,
      passed: exam.passed === true,
      attempts: Number.isInteger(Number(exam.attempts)) ? Math.max(0, Number(exam.attempts)) : 0,
      submittedAt: typeof exam.submittedAt === 'string' ? exam.submittedAt : null
    };
  }
  return result;
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
    schemaVersion: 2,
    activeDay: Number.isInteger(activeDay) ? Math.min(100, Math.max(1, activeDay)) : 1,
    completedDays: [...new Set(completedDays)].sort((a, b) => a - b),
    completedLessons: normalizeCompletedLessons(value.completedLessons),
    exams: normalizeExams(value.exams),
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

function examForDay(day) {
  return state.exams[Number(day)] || {
    answers: {},
    submitted: false,
    score: null,
    passed: false,
    attempts: 0,
    submittedAt: null
  };
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
  isLessonCompleted(day, lessonIndex) {
    return (state.completedLessons[Number(day)] || []).includes(Number(lessonIndex));
  },
  getCompletedLessonCount(day, totalLessons = 5) {
    return (state.completedLessons[Number(day)] || []).filter(index => index < Number(totalLessons)).length;
  },
  areLessonsCompleted(day, totalLessons = 5) {
    return this.getCompletedLessonCount(day, totalLessons) >= Number(totalLessons);
  },
  completeLesson(day, lessonIndex, totalLessons = 5) {
    const targetDay = Number(day);
    const targetLesson = Number(lessonIndex);
    const total = Number(totalLessons);
    if (!Number.isInteger(targetDay) || targetDay < 1 || targetDay > 100 ||
        !Number.isInteger(targetLesson) || targetLesson < 0 || targetLesson >= total) {
      return { ok: false, reason: 'This lesson cannot be completed because its lesson data is invalid.' };
    }
    const completed = state.completedLessons[targetDay] || [];
    if (completed.includes(targetLesson)) {
      return { ok: true, completedCount: completed.length, allCompleted: completed.length >= total };
    }
    if (targetLesson > completed.length) {
      return { ok: false, reason: 'Complete the lessons in sequence before continuing.' };
    }
    completed.push(targetLesson);
    completed.sort((a, b) => a - b);
    state.completedLessons[targetDay] = completed;
    persist();
    return { ok: true, completedCount: completed.length, allCompleted: completed.length >= total };
  },
  getExamState(day) {
    return JSON.parse(JSON.stringify(examForDay(day)));
  },
  setExamAnswer(day, questionIndex, optionIndex) {
    const targetDay = Number(day);
    const question = Number(questionIndex);
    const option = Number(optionIndex);
    const exam = examForDay(targetDay);
    if (exam.submitted || !Number.isInteger(question) || question < 0 || question >= 5 ||
        !Number.isInteger(option) || option < 0 || option >= 4) return false;
    exam.answers[question] = option;
    state.exams[targetDay] = exam;
    persist();
    return true;
  },
  submitExam(day, correctOptions, passMark = 4) {
    const targetDay = Number(day);
    const exam = examForDay(targetDay);
    const expected = Array.isArray(correctOptions) ? correctOptions : [];
    if (exam.submitted) return { ok: false, reason: 'This attempt has already been submitted.' };
    if (expected.length !== 5 || expected.some((option, index) => !Number.isInteger(Number(exam.answers[index])))) {
      return { ok: false, reason: 'Answer all five questions before submitting the exam.' };
    }
    const score = expected.reduce((total, correct, index) => total + (Number(exam.answers[index]) === Number(correct) ? 1 : 0), 0);
    const passed = score >= Number(passMark);
    const updated = {
      ...exam,
      submitted: true,
      score,
      passed,
      attempts: exam.attempts + 1,
      submittedAt: new Date().toISOString()
    };
    state.exams[targetDay] = updated;
    if (passed && !state.completedDays.includes(targetDay)) {
      state.completedDays.push(targetDay);
      state.completedDays.sort((a, b) => a - b);
    }
    persist();
    return { ok: true, score, passed, attempts: updated.attempts };
  },
  retryExam(day) {
    const targetDay = Number(day);
    const exam = examForDay(targetDay);
    if (!exam.submitted || exam.passed) return false;
    state.exams[targetDay] = {
      answers: {},
      submitted: false,
      score: null,
      passed: false,
      attempts: exam.attempts,
      submittedAt: null
    };
    persist();
    return true;
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
    if (target === 1) return true;
    for (let previousDay = 1; previousDay < target; previousDay += 1) {
      if (!state.completedDays.includes(previousDay)) return false;
    }
    return true;
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
