# Deploy & CI/CD

Workflow ở `.github/workflows/`:

| File | Trigger | Việc làm |
|---|---|---|
| `backend-hf.yml` | push `main` đụng `backend/**` | Đóng gói `backend/` → push lên HuggingFace Space → Space tự build Docker & restart |
| `frontend.yml` | push/PR đụng `frontend/**` | `npm install` → `tsc --noEmit` → `next build` |

> Workflow Vercel (deploy frontend) chạy độc lập sau khi bạn connect repo bên Vercel — không cần GitHub Actions.

---

## 1. Tạo Hugging Face Space (lần đầu)

1. Đăng nhập https://huggingface.co
2. Vào https://huggingface.co/new-space
3. Cấu hình:
   - **Space name**: `tomato-novel-backend` (hoặc tuỳ chọn)
   - **License**: tuỳ
   - **SDK**: **Docker**
   - **Hardware**: CPU basic (free, 16GB RAM)
   - **Visibility**: Public (free tier) hoặc Private (yêu cầu Pro để Space public không sleep, nhưng Docker space free vẫn không sleep)
4. **Create Space** — Space mặc định trống, đợi GitHub Actions push code vào.

### 1.1. Secret cần thêm trên HF Space

`Space → Settings → Variables and secrets → New secret`:

| Secret | Giá trị |
|---|---|
| `SUPABASE_URL` | URL Supabase |
| `SUPABASE_SERVICE_KEY` | service-role key |
| `API_SECRET_KEY` | random string dài — frontend Vercel dùng làm `x-api-key` |
| `TOMATO_WEB_PASSWORD` | optional, bảo vệ Tomato WebUI nội bộ |
| `DS2API_CONFIG_JSON` | optional, JSON/Base64 config từ `backend/ds2api-config.example.json` |
| `DS2API_ADMIN_KEY` | optional, admin key nội bộ |
| `CRON_SCHEDULE` | optional, mặc định `0 */8 * * *` |

### 1.2. Token HF cho GitHub Actions

Vào https://huggingface.co/settings/tokens → **New token** → name "github-actions" → **Write** access → Generate → copy token.

### 1.3. DS2API nội bộ

Nếu muốn dịch qua DS2API trong cùng HF Space:

1. Copy `backend/ds2api-config.example.json` ra file riêng ngoài repo.
2. Đổi `keys[0]` thành một key bạn tự đặt, ví dụ `novel-ds2api-...`.
3. Điền DeepSeek `accounts` của bạn.
4. Nén JSON thành một dòng hoặc base64 rồi lưu vào HF secret `DS2API_CONFIG_JSON`.
5. Trên Vercel đặt `DEEPSEEK_API_KEY` bằng key ở bước 2, để `DEEPSEEK_BASE_URL` trống.

---

## 2. GitHub repository setup

Vào `Settings → Secrets and variables → Actions → New repository secret`:

| Secret | Giá trị |
|---|---|
| `HF_TOKEN` | Token vừa tạo ở 1.2 |
| `HF_USERNAME` | Username HuggingFace của bạn (vd `khanhkhanh`) |
| `HF_SPACE_NAME` | Tên Space tạo ở 1 (vd `tomato-novel-backend`) |

---

## 3. Push code → tự deploy

```
git push origin main
   ↓
.github/workflows/backend-hf.yml chạy:
   1. Checkout repo GitHub
   2. Stage nội dung backend/ vào _hf_space/ (Dockerfile.hf → Dockerfile, space-README.md → README.md, …)
   3. git push --force lên https://huggingface.co/spaces/<HF_USER>/<HF_SPACE>
   ↓
HuggingFace nhận push, tự build Docker image từ Dockerfile mới
   ↓
Space khởi động lại với code mới (downtime ~30-60s)
```

URL backend sau khi build xong: `https://<HF_USERNAME>-<HF_SPACE_NAME>.hf.space`

Verify: `curl https://<HF_USERNAME>-<HF_SPACE_NAME>.hf.space/api/health` → `{"status":"ok"}`

---

## 4. Frontend Vercel

1. https://vercel.com/new → import `TomatoNovelTrans`
2. **Root Directory** → `frontend`
3. **Environment Variables** — điền:

| Var | Giá trị |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_KEY` | service-role key |
| `AZURE_BACKEND_URL` | `https://<HF_USER>-<HF_SPACE>.hf.space` |
| `AZURE_API_SECRET_KEY` | giống `API_SECRET_KEY` ở HF Space |
| `GEMINI_API_KEY` | aistudio.google.com/apikey |
| `GEMINI_MODEL` | `gemini-2.5-flash` |
| `DEEPSEEK_API_KEY` | key trong `DS2API_CONFIG_JSON.keys` nếu dùng DS2API nội bộ |
| `DEEPSEEK_BASE_URL` | optional; để trống sẽ tự dùng `${AZURE_BACKEND_URL}/api/ds2api` |
| `DEEPSEEK_MODEL` | optional, mặc định `deepseek-chat` |
| `OPENROUTER_API_KEY` | optional, key OpenRouter |
| `OPENROUTER_BASE_URL` | optional, mặc định `https://openrouter.ai/api` |
| `OPENROUTER_MODEL` | optional, mặc định `deepseek/deepseek-chat` |
| `QWEN_API_KEY` | optional |
| `MYMEMORY_EMAIL` | optional |

4. Deploy. Vercel tự rebuild khi push vào `main`.

---

## 5. Xử lý sự cố

| Lỗi | Cách xử lý |
|---|---|
| GitHub Action `backend-hf.yml` fail "Thiếu secret HF_*" | Kiểm tra 3 secret `HF_TOKEN`, `HF_USERNAME`, `HF_SPACE_NAME` ở GitHub repo settings |
| HF Space build fail | Vào tab **Logs** của Space — thường do dockerfile syntax hoặc môi trường base image. Kiểm tra Tomato image `zhongbai233/tomato-novel-downloader-webui` vẫn còn trên Docker Hub. |
| Space build OK nhưng `/api/health` không trả | Tab **Logs** → tìm log từ supervisord + node. Có thể supervisord chưa start `backend` nếu Tomato crash. |
| Tomato 401/403 từ backend | Đặt cùng `TOMATO_WEB_PASSWORD` ở cả 2 nơi: secret HF Space + frontend env `AZURE_API_SECRET_KEY` (không liên quan, đây là khác — `TOMATO_WEB_PASSWORD` chỉ là internal pwd cho Tomato). Hoặc bỏ password đi. |
| Vercel `fetch` Azure backend fail (CORS / timeout) | Mặc định backend đã `app.use(cors())` cho phép all origins. Nếu vẫn fail kiểm tra `AZURE_BACKEND_URL` đúng URL HF Space và `AZURE_API_SECRET_KEY` match. |
| Free HF Space restart mất file `/data` | Bình thường — chương đã sync sang Supabase rồi. Lần sync sau Tomato sẽ re-download. |

---

## 6. Dev local

```bash
# Backend chạy local (không có Tomato — chỉ test Express + Supabase)
cd backend
cp .env.example .env  # điền SUPABASE_*, API_SECRET_KEY
npm install
npm run dev

# Frontend
cd frontend
cp .env.example .env.local
npm install
npm run dev   # → localhost:3000
```

Muốn test cả Tomato local: chạy `docker run -p 18423:18423 -v $PWD/tomato-data:/data zhongbai233/tomato-novel-downloader-webui --server --data-dir /data` rồi set `TOMATO_API_URL=http://localhost:18423` trong `backend/.env`.

---

## 7. Files trong repo phục vụ deploy

Note: DS2API startup now forces `current_input_file.enabled=false`. If your
existing HF secret `DS2API_CONFIG_JSON` does not include this field, redeploying
the backend is enough; the wrapper patches `/data/ds2api/config.json` before
DS2API starts.

```
.github/workflows/
├── backend-hf.yml      # GitHub Actions: push backend/ → HF Space
└── frontend.yml        # GitHub Actions: typecheck + build Next.js

backend/
├── Dockerfile          # cho dev local / VM (build:.)
├── Dockerfile.hf       # cho HF Space (combine Tomato + Express + supervisord)
├── docker-compose.yml  # dev local: 2 service tách biệt
├── docker-compose.prod.yml  # VM deploy: image GHCR (không dùng nếu host HF)
├── supervisord.conf    # config supervisord trong Dockerfile.hf
├── ds2api-start.sh     # patches DS2API config before starting bridge
├── space-README.md     # README HF Space (workflow rename → README.md)
└── ...
```
