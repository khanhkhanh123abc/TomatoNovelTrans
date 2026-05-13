const axios = require('axios');
const config = require('../config');
const logger = require('../utils/logger');

const client = axios.create({
  baseURL: config.TOMATO_API_URL,
  timeout: 30000,
  headers: config.TOMATO_PASSWORD
    ? { 'x-tomato-password': config.TOMATO_PASSWORD }
    : {},
});

client.interceptors.response.use(
  (res) => res,
  (err) => {
    const status = err.response?.status;
    const body = err.response?.data;
    logger.error(`Tomato API ${err.config?.method?.toUpperCase()} ${err.config?.url} → ${status}`, { body });
    return Promise.reject(err);
  }
);

function normalizeCoverUrl(value) {
  if (!value || typeof value !== 'string') return null;
  if (/^https?:\/\//i.test(value)) return value;

  const clean = value.replace(/^\/+/, '');
  if (clean.startsWith('novel-pic/')) {
    return `https://p3-novel.byteimg.com/origin/${clean}`;
  }

  return value;
}

module.exports = {
  async searchNovel(keyword) {
    const res = await client.get('/api/search', { params: { q: keyword } });
    const items = Array.isArray(res.data) ? res.data : res.data?.items || [];

    return items
      .map((item) => {
        const raw = item?.raw || item || {};
        const totalChapters =
          item?.total_chapters ??
          raw?.total_chapters ??
          raw?.chapter_count ??
          raw?.last_chapter_item?.chapter_index;

        return {
          book_id: String(item?.book_id ?? raw?.book_id ?? ''),
          title:
            item?.title ??
            item?.book_name ??
            raw?.book_name ??
            raw?.book_short_name ??
            '',
          author: item?.author ?? raw?.author ?? null,
          cover_url: normalizeCoverUrl(
            item?.cover_url ??
              item?.thumb_uri ??
              raw?.thumb_uri ??
              raw?.thumb_url ??
              raw?.audio_thumb_uri ??
              null
          ),
          description:
            item?.description ??
            item?.abstract ??
            raw?.abstract ??
            raw?.book_abstract_v2 ??
            null,
          total_chapters: Number.isFinite(Number(totalChapters))
            ? Number(totalChapters)
            : undefined,
        };
      })
      .filter((item) => item.book_id && item.title);
  },

  async downloadNovel(bookId) {
    const res = await client.post('/api/jobs', { book_id: bookId });
    return {
      ...res.data,
      task_id: res.data?.id,
    };
  },

  async getTaskStatus(taskId) {
    const res = await client.get('/api/jobs');
    const items = Array.isArray(res.data?.items) ? res.data.items : [];
    const job = items.find((item) => String(item.id) === String(taskId));
    if (!job) {
      return { status: 'failed', message: `Không tìm thấy Tomato job ${taskId}` };
    }

    return {
      ...job,
      completed: job.state === 'done',
      status: job.state,
    };
  },

  async updateNovel(bookId) {
    return this.downloadNovel(bookId);
  },

  async listDownloads() {
    const res = await client.get('/api/downloads');
    return res.data;
  },
};
