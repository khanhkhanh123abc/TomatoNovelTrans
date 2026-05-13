const express = require('express');
const tomato = require('../services/tomato');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const keyword = (req.query.keyword || '').trim();
    if (!keyword) return res.status(400).json({ error: 'keyword required' });
    const results = await tomato.searchNovel(keyword);
    res.json(results);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
