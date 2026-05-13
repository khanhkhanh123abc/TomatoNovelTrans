const express = require('express');
const logger = require('../utils/logger');
const { syncAllNovels } = require('../services/cronJob');

const router = express.Router();

// Trigger sync tất cả (non-blocking)
router.post('/all', (req, res) => {
  syncAllNovels().catch((err) => logger.error(`Manual sync-all error: ${err.message}`));
  res.json({ success: true, message: 'Đã bắt đầu quét cập nhật tất cả truyện' });
});

module.exports = router;
