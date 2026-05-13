const axios = require('axios');
const config = require('../config');
const logger = require('../utils/logger');

const client = axios.create({
  baseURL: config.TOMATO_API_URL,
  timeout: 30000,
  headers: config.TOMATO_PASSWORD
    ? { Authorization: `Bearer ${config.TOMATO_PASSWORD}` }
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

module.exports = {
  async searchNovel(keyword) {
    const res = await client.get('/api/search', { params: { keyword } });
    return res.data;
  },

  async downloadNovel(bookId) {
    const res = await client.post('/api/download', { book_id: bookId });
    return res.data;
  },

  async getTaskStatus(taskId) {
    const res = await client.get(`/api/task/${taskId}`);
    return res.data;
  },

  async updateNovel(bookId) {
    const res = await client.post('/api/update', { book_id: bookId });
    return res.data;
  },

  async listDownloads() {
    const res = await client.get('/api/downloads');
    return res.data;
  },
};
