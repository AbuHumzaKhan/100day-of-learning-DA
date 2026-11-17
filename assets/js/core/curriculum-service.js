export class CurriculumService {
  constructor() {
    this.cache = new Map();
    this.manifest = null;
    this.index = null;
    this.datasets = null;
  }

  async fetchJson(path, version = 'current') {
    const key = `${path}@${version}`;
    if (this.cache.has(key)) return this.cache.get(key);
    const url = new URL(`./${path}`, window.location.href);
    url.searchParams.set('v', version);
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`Could not load ${path} (HTTP ${response.status}).`);
    const data = await response.json();
    this.cache.set(key, data);
    return data;
  }

  async init() {
    const [manifest, index, datasets] = await Promise.all([
      this.fetchJson('manifest.json'),
      this.fetchJson('curriculum/index.json'),
      this.fetchJson('datasets/index.json')
    ]);
    this.manifest = manifest;
    this.index = index;
    this.datasets = datasets;
    this.validateRelease();
    return { manifest, index, datasets };
  }

  validateRelease() {
    const published = Number(this.manifest?.release_control?.published_through_day);
    if (!Number.isInteger(published) || published < 1) throw new Error('The release manifest has an invalid published-day value.');
    if (Number(this.index?.published_through_day) !== published) throw new Error('The manifest and curriculum index disagree about the published-day boundary.');
    const manifestDays = this.manifest.release_control.open_days || [];
    const indexDays = this.index.open_days || [];
    if (JSON.stringify(manifestDays) !== JSON.stringify(indexDays)) throw new Error('The manifest and curriculum index have different open-day lists.');
    for (const day of indexDays) {
      if (!this.index.days?.some(item => Number(item.day) === Number(day))) throw new Error(`Day ${day} is listed as open but is missing from the curriculum index.`);
    }
  }

  getPublishedThrough() {
    return Number(this.manifest?.release_control?.published_through_day || 0);
  }

  getDayMeta(day) {
    return this.index?.days?.find(item => Number(item.day) === Number(day)) || null;
  }

  async getDay(day) {
    const meta = this.getDayMeta(day);
    if (!meta) throw new Error(`Day ${day} is not present in the curriculum index.`);
    const version = this.manifest?.version || 'current';
    const data = await this.fetchJson(`curriculum/${meta.file}`, version);
    this.validateDay(data, day);
    return data;
  }

  validateDay(dayData, expectedDay) {
    if (Number(dayData?.day) !== Number(expectedDay)) throw new Error(`The Day ${expectedDay} resource has an unexpected day number.`);
    if (!Array.isArray(dayData.topics) || dayData.topics.length !== 5) throw new Error(`Day ${expectedDay} must contain exactly five topics.`);
    dayData.topics.forEach((topic, index) => {
      if (!Array.isArray(topic.questions) || topic.questions.length !== 3) throw new Error(`Day ${expectedDay}, Topic ${index + 1} must contain exactly three questions.`);
      topic.questions.forEach((question, questionIndex) => {
        if (!question.id || !question.request) throw new Error(`Day ${expectedDay}, Topic ${index + 1}, Question ${questionIndex + 1} is missing required content.`);
      });
    });
  }

  async getSearchIndex() {
    const days = await Promise.all((this.index?.open_days || []).map(async day => {
      try {
        const data = await this.getDay(day);
        return data.topics.flatMap((topic, topicIndex) => {
          const teaching = topic.teaching || {};
          const teachingText = ['teacher', 'explain', 'detailedlearning', 'expose', 'example']
            .map(key => teaching[key] || '')
            .join(' ');
          return [
            { day, topicIndex, questionIndex: null, type: 'Topic', title: topic.title, detail: `${data.track} · ${topic.business_skill || data.title}`, searchText: `${data.title} ${topic.title} ${topic.business_skill || ''} ${teachingText}` },
            ...topic.questions.map((q, questionIndex) => ({ day, topicIndex, questionIndex, type: 'Business request', title: q.request, detail: `${q.role || 'Stakeholder'} · ${q.difficulty || 'Task'}`, searchText: `${data.title} ${topic.title} ${q.role || ''} ${q.scenario || ''} ${q.request || ''} ${q.validation || ''} ${(q.output || []).join(' ')}` }))
          ];
        });
      } catch (error) {
        console.warn(`Search index skipped Day ${day}.`, error);
        return [];
      }
    }));
    return days.flat();
  }
}
