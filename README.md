# 📚 EpubTrans

Hệ thống đọc + dịch truyện Trung → Việt. Kiến trúc 3 phần:

```
backend/       # Node/Express trên Azure VM (Docker compose: backend + Tomato downloader)
frontend/      # Next.js 14 App Router (deploy Vercel)
sql/           # Supabase DDL
src/           # [LEGACY] Vite client cũ — dùng riêng cho EPUB upload thủ công
```

> Repo này còn giữ thư mục `src/` + `package.json` + `vite.config.js` ở root — đó là **app client-side cũ** (upload EPUB, parse + dịch ngay trong browser, không có backend). Vẫn chạy được độc lập, nhưng phiên bản chính từ giờ là `frontend/` + `backend/`.

---

## Setup nhanh

### 1. Supabase
1. Tạo project mới.
2. SQL Editor → paste & chạy `sql/schema.sql`.
3. Lấy:
   - `Project URL`
   - `anon public key`
   - `service_role key` (server-only, đừng commit)

### 2. Azure VM — backend
```bash
cd backend
cp .env.example .env  # điền SUPABASE_*, API_SECRET_KEY, TOMATO_PASSWORD
docker compose up -d
curl http://localhost:3001/api/health
```
Mở port 3001 trong NSG/firewall của VM. Backend auth bằng header `x-api-key: $API_SECRET_KEY`.

Cron mặc định chạy mỗi 8h (`0 */8 * * *`). Override qua `CRON_SCHEDULE` trong `.env`. Để trống `CRON_SCHEDULE=` để tắt.

### 3. Frontend Vercel
```bash
cd frontend
npm install
cp .env.example .env.local  # điền đủ
npm run dev
```

Env vars cần khai báo trong Vercel dashboard (Production):

| Var | Nguồn |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase |
| `SUPABASE_SERVICE_KEY` | Supabase (server-only) |
| `AZURE_BACKEND_URL` | `http://<vm-ip>:3001` |
| `AZURE_API_SECRET_KEY` | giống `API_SECRET_KEY` ở backend |
| `GEMINI_API_KEY` | aistudio.google.com/apikey |
| `GEMINI_MODEL` | `gemini-2.5-flash` (mặc định) |
| `DEEPSEEK_API_KEY` | key DeepSeek official hoặc key trong DS2API `keys` |
| `DEEPSEEK_BASE_URL` | tuỳ chọn; để trống sẽ tự dùng `${AZURE_BACKEND_URL}/api/ds2api` |
| `DEEPSEEK_MODEL` | `deepseek-chat` hoặc model DS2API |
| `OPENROUTER_API_KEY` | optional, key OpenRouter |
| `OPENROUTER_BASE_URL` | optional, mặc định `https://openrouter.ai/api` |
| `OPENROUTER_MODEL` | optional, mặc định `deepseek/deepseek-chat` |
| `QWEN_API_KEY` | tuỳ chọn |
| `MYMEMORY_EMAIL` | tuỳ chọn, tăng quota free |

API keys dịch nằm hoàn toàn server-side, không lộ về browser.

DS2API startup disables `current_input_file` automatically, so DeepSeek batches
are not uploaded as temporary files. This avoids bridge-side errors like
`upload current user input file`.

---

## Flow tổng thể

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  Vercel      │    │  Supabase    │    │  Azure VM    │
│  (Next.js)   │    │              │    │              │
│              │    │  novels      │    │ Express +    │
│  - duyệt     │◀──▶│  chapters    │◀──▶│ Tomato DL    │
│  - đọc       │    │  sync_logs   │    │ (Docker)     │
│  - dịch      │    │              │    │ cron 8h      │
└──────┬───────┘    └──────────────┘    └──────────────┘
       │
       └── /api/translate → Gemini/DeepSeek/Qwen/MyMemory (server-side)
```

### Thêm truyện mới
1. Frontend `/search` → gõ tên TQ → `POST /api/search?keyword=…`
2. Next.js proxy `→ Azure /api/search` (auth `x-api-key`) → Tomato `search`
3. Click "Thêm" → `POST /api/search` (body book_id+title) → Azure `/api/novels/add`
4. Backend lưu metadata vào Supabase + trigger download nền + parse EPUB sau khi xong → upsert chapters

### Đọc + dịch chương
1. Frontend đọc `novels` + `chapters(meta)` từ Supabase qua anon key (RLS chỉ cho select)
2. Chọn chương → fetch `content` từ Supabase
3. "Dịch chương" → chia batch theo provider → `POST /api/translate` từng batch → progress bar
4. Xong → `POST /api/save-translation` ghi `translated_content` bằng service key

### Cập nhật tự động
- Cron 8h trên Azure VM gọi `syncAllNovels()` → với mỗi truyện active: `tomato.updateNovel` → đợi task → parse EPUB mới → upsert chương mới → log `sync_logs`
- Thủ công: nút "🔄 Kiểm tra cập nhật" trong reader → `POST /api/sync { book_id }` → Azure `/api/novels/:bookId/sync`

---

## Tomato API endpoints

Code adapter (`backend/src/services/tomato.js`) đang gọi:
- `GET  /api/search?keyword=…`
- `POST /api/download { book_id }`
- `GET  /api/task/:taskId`
- `POST /api/update { book_id }`
- `GET  /api/downloads`

Nếu Tomato Web UI có endpoint khác, sửa file đó — phần còn lại không cần đụng.

---

## Dev shortcuts

```bash
# Backend
cd backend && npm install && npm run dev        # nodemon
cd backend && npm run sync                      # chạy syncAllNovels một lần (không qua cron)

# Frontend
cd frontend && npm install && npm run dev       # localhost:3000

# Schema
psql "$SUPABASE_DB_URL" -f sql/schema.sql       # hoặc paste vào SQL Editor
```

---

## Files chính

```
backend/
├── docker-compose.yml          # tomato-downloader + novel-backend
├── Dockerfile
├── package.json
├── .env.example
└── src/
    ├── index.js                # Express + cron start
    ├── config.js
    ├── routes/{search,novels,sync}.js
    ├── services/
    │   ├── tomato.js           # ← chỉnh khi Tomato endpoints khác
    │   ├── epubParser.js
    │   ├── supabase.js
    │   └── cronJob.js          # syncAll + syncOne + waitForTask
    └── utils/{logger,helpers}.js

frontend/
├── next.config.js, tsconfig.json, tailwind.config.ts
├── .env.example
├── app/
│   ├── layout.tsx, globals.css
│   ├── page.tsx                # home: grid truyện
│   ├── search/page.tsx         # tìm + thêm
│   ├── novels/[id]/
│   │   ├── page.tsx            # server load metadata
│   │   ├── Reader.tsx          # client: sidebar + reader + translate
│   │   └── not-found.tsx
│   ├── components/{NovelCard,SyncAllButton}.tsx
│   └── api/
│       ├── translate/route.ts          # 5 providers, server-side keys
│       ├── save-translation/route.ts   # service key upsert
│       ├── search/route.ts             # proxy → Azure
│       └── sync/route.ts               # proxy → Azure
└── lib/
    ├── types.ts
    ├── translate.ts            # buildBatches + retry + 4 providers
    ├── azure.ts                # azureGet/Post helper
    ├── supabase-browser.ts
    └── supabase-server.ts      # anon + service clients

sql/schema.sql                  # novels, chapters, sync_logs + RLS
```
