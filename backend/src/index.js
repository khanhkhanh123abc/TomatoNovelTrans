const express = require('express');
const cors = require('cors');
const config = require('./config');
const logger = require('./utils/logger');
const { startCron } = require('./services/cronJob');

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

// Auth middleware
function requireApiKey(req, res, next) {
  if (req.headers['x-api-key'] !== config.API_SECRET_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// Health (không cần auth)
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Mount routes (đều cần API key)
app.use('/api/search', requireApiKey, require('./routes/search'));
app.use('/api/novels', requireApiKey, require('./routes/novels'));
app.use('/api/sync', requireApiKey, require('./routes/sync'));

// Error handler
app.use((err, req, res, next) => {
  logger.error(`${req.method} ${req.url} → ${err.message}`);
  const status = err.response?.status || err.status || 500;
  res.status(status).json({ error: err.message, detail: err.response?.data });
});

app.listen(config.PORT, () => {
  logger.info(`🚀 Backend chạy tại :${config.PORT}`);
  startCron();
});
