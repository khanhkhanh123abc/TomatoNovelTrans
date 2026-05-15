require('dotenv').config();

const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'API_SECRET_KEY'];
const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`[config] Thiếu env vars: ${missing.join(', ')}`);
  process.exit(1);
}

module.exports = {
  PORT: parseInt(process.env.PORT || '3001', 10),
  API_SECRET_KEY: process.env.API_SECRET_KEY,

  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY,

  TOMATO_API_URL: process.env.TOMATO_API_URL || 'http://localhost:18423',
  TOMATO_PASSWORD: process.env.TOMATO_PASSWORD || process.env.TOMATO_WEB_PASSWORD || '',
  TOMATO_DOWNLOAD_DIR: process.env.TOMATO_DOWNLOAD_DIR || '/data',

  DS2API_BASE_URL: process.env.DS2API_BASE_URL || 'http://127.0.0.1:5001',

  CRON_SCHEDULE: process.env.CRON_SCHEDULE ?? '0 */8 * * *',
};
