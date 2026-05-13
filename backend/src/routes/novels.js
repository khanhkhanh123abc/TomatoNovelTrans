const express = require('express');
const supabaseSvc = require('../services/supabase');
const { syncOneNovel } = require('../services/cronJob');

const router = express.Router();

// Thêm truyện mới: lưu metadata + trigger download lần đầu
router.post('/add', async (req, res, next) => {
  try {
    const { book_id, title, author, cover_url, description } = req.body || {};
    if (!book_id || !title) return res.status(400).json({ error: 'book_id và title bắt buộc' });

    const novel = await supabaseSvc.upsertNovel({
      book_id,
      title,
      author,
      cover_url,
      description,
      total_chapters: 0,
    });

    const result = await syncOneNovel(novel, { action: 'download' });

    res.json({
      success: true,
      novel,
      ...result,
      message: `Đã tải ${result.totalChapters || 0} chương`,
    });
  } catch (err) {
    next(err);
  }
});

// Kiểm tra cập nhật 1 truyện (thủ công, đồng bộ)
router.post('/:bookId/sync', async (req, res, next) => {
  try {
    const { bookId } = req.params;
    const novel = await supabaseSvc.getNovelByBookId(bookId);
    if (!novel) return res.status(404).json({ error: 'Không tìm thấy truyện' });
    const action = (novel.total_chapters || 0) === 0 ? 'download' : 'update';
    const result = await syncOneNovel(novel, { action });
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
