const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const logger = require('../utils/logger');
const { sleep, walkDir } = require('../utils/helpers');
const tomato = require('./tomato');
const supabaseSvc = require('./supabase');
const { parseEpub } = require('./epubParser');

function findLatestEpubFor(bookId) {
  const files = walkDir(config.TOMATO_DOWNLOAD_DIR)
    .filter((f) => f.toLowerCase().endsWith('.epub'))
    .filter((f) => {
      if (!bookId) return true;
      const base = path.basename(f);
      return base.includes(String(bookId));
    });
  if (!files.length) return null;
  return files.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
}

async function waitForTask(taskId, { maxWaitMs = 5 * 60 * 1000, pollMs = 5000 } = {}) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const status = await tomato.getTaskStatus(taskId);
    if (status?.completed || status?.status === 'done') return status;
    if (status?.status === 'failed') throw new Error(`Task ${taskId} failed: ${status.message || ''}`);
    await sleep(pollMs);
  }
  throw new Error(`Task ${taskId} timeout`);
}

async function syncOneNovel(novel, { action = 'update' } = {}) {
  logger.info(`Sync: ${novel.title} (${novel.book_id})`);
  try {
    const result = action === 'download'
      ? await tomato.downloadNovel(novel.book_id)
      : await tomato.updateNovel(novel.book_id);

    if (result?.taskId || result?.task_id) {
      await waitForTask(result.taskId || result.task_id);
    }

    const epubPath = findLatestEpubFor(novel.book_id);
    if (!epubPath) {
      await supabaseSvc.logSync(novel.id, 'check', 0, 'failed', 'EPUB không tìm thấy');
      return { newChapters: 0, error: 'EPUB không tìm thấy' };
    }

    const parsed = await parseEpub(epubPath);
    const currentCount = await supabaseSvc.getChapterCount(novel.id);
    const newChapters = Math.max(0, parsed.chapters.length - currentCount);

    if (newChapters > 0 || currentCount === 0) {
      await supabaseSvc.upsertChapters(novel.id, parsed.chapters);
      await supabaseSvc.upsertNovel({
        ...novel,
        title: novel.title || parsed.title,
        author: novel.author || parsed.author,
        total_chapters: parsed.chapters.length,
      });
      await supabaseSvc.logSync(novel.id, action, newChapters, 'success',
        `Cập nhật ${newChapters} chương mới (tổng ${parsed.chapters.length})`);
      logger.info(`  +${newChapters} chương mới`);
    } else {
      await supabaseSvc.logSync(novel.id, 'check', 0, 'success', 'Không có chương mới');
      logger.info('  không có chương mới');
    }

    return { newChapters, totalChapters: parsed.chapters.length };
  } catch (err) {
    logger.error(`Sync failed: ${novel.title}: ${err.message}`);
    await supabaseSvc.logSync(novel.id, action, 0, 'failed', err.message);
    throw err;
  }
}

async function syncAllNovels() {
  logger.info('🔄 Bắt đầu quét cập nhật...');
  const novels = await supabaseSvc.getAllNovels();
  logger.info(`Có ${novels.length} truyện cần kiểm tra`);

  let totalNew = 0;
  for (const novel of novels) {
    try {
      const r = await syncOneNovel(novel);
      totalNew += r.newChapters || 0;
    } catch {
      // logSync trong syncOneNovel đã ghi nhận
    }
    await sleep(3000);
  }
  logger.info(`✅ Hoàn tất. Tổng ${totalNew} chương mới.`);
  return { totalNew };
}

function startCron() {
  if (!config.CRON_SCHEDULE) {
    logger.info('⏰ CRON_SCHEDULE trống — bỏ qua cron job');
    return;
  }
  if (!cron.validate(config.CRON_SCHEDULE)) {
    logger.error(`Cron schedule không hợp lệ: ${config.CRON_SCHEDULE}`);
    return;
  }
  cron.schedule(config.CRON_SCHEDULE, () => {
    syncAllNovels().catch((err) => logger.error(`Cron sync error: ${err.message}`));
  });
  logger.info(`⏰ Cron đã khởi động: "${config.CRON_SCHEDULE}"`);
}

module.exports = { startCron, syncAllNovels, syncOneNovel };
