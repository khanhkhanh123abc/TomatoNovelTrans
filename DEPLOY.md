# Deploy & CI/CD

Workflow ở `.github/workflows/`:

| File | Trigger | Việc làm |
|---|---|---|
| `backend.yml` | push vào `main` đụng `backend/**` | Syntax check → build Docker image → push `ghcr.io/khanhkhanh123abc/tomatonoveltrans-backend:latest` → SSH VM pull & restart |
| `frontend.yml` | push/PR vào `frontend/**` | `npm install` → `tsc --noEmit` → `next build` |

## 1. GitHub repository setup

### Secrets (`Settings → Secrets and variables → Actions → New repository secret`)

| Secret | Giá trị | Dùng cho |
|---|---|---|
| `VM_SSH_HOST` | IP/hostname Azure VM | backend deploy |
| `VM_SSH_USER` | username SSH (vd `azureuser`) | backend deploy |
| `VM_SSH_KEY` | private key (nội dung file `~/.ssh/id_ed25519`) | backend deploy |
| `VM_SSH_PORT` | port SSH (mặc định 22, để trống nếu 22) | backend deploy |
| `VM_DEPLOY_PATH` | path repo clone trên VM, vd `/home/azureuser/TomatoNovelTrans` | backend deploy |

> `GITHUB_TOKEN` đã có sẵn (do GitHub Actions tự cấp), không cần thêm thủ công. Nó dùng để push image lên GHCR.

### Variables (`Settings → Secrets and variables → Actions → Variables tab`)

| Variable | Giá trị | Ý nghĩa |
|---|---|---|
| `DEPLOY_ENABLED` | `true` | Bật job deploy. Đặt `false` (hoặc không tạo) → workflow chỉ build & push image, không SSH deploy. |

Để workflow chạy thử trước khi setup VM xong: đừng tạo `DEPLOY_ENABLED`, hoặc đặt `false`. Job `deploy` sẽ skip.

## 2. Setup lần đầu trên Azure VM

```bash
# 2.1. Cài Docker
sudo apt update && sudo apt install -y docker.io docker-compose-plugin
sudo usermod -aG docker $USER && newgrp docker

# 2.2. Clone repo
cd ~
git clone git@github.com:khanhkhanh123abc/TomatoNovelTrans.git
cd TomatoNovelTrans

# 2.3. Cấu hình env cho backend
cp backend/.env.example backend/.env
nano backend/.env   # điền SUPABASE_*, API_SECRET_KEY, TOMATO_PASSWORD

# 2.4. Pull image lần đầu (GHCR public, không cần login nếu image public)
#     Nếu image private, login trước:
#     echo $PAT | docker login ghcr.io -u khanhkhanh123abc --password-stdin
docker compose -f backend/docker-compose.prod.yml pull

# 2.5. Khởi động
docker compose -f backend/docker-compose.prod.yml --env-file backend/.env up -d

# 2.6. Kiểm tra
curl http://localhost:3001/api/health
docker logs novel-backend --tail 50
```

### Mở port

Azure Portal → VM → Networking → Add inbound rule:
- Port 3001 (backend, cho Vercel call) — restrict source IP nếu muốn
- Port 18423 (Tomato Web UI, tuỳ chọn — chỉ mở khi cần truy cập GUI)

## 3. Sau đó, mỗi lần push code mới

```
[push code vào main, có thay đổi backend/]
   ↓
GitHub Actions chạy backend.yml:
   1. ci          → kiểm syntax
   2. build-push  → build Dockerfile, push ghcr.io/...backend:latest + sha-xxxxxxx
   3. deploy      → SSH VM, git pull, docker compose pull, up -d
   ↓
Backend mới chạy trên VM (downtime ~5-10 giây)
```

## 4. Vercel frontend

Connect repo trên Vercel:
1. https://vercel.com/new → import `TomatoNovelTrans`
2. **Root Directory** → `frontend`
3. **Framework Preset** → Next.js (auto-detect)
4. **Environment Variables** → copy từ `frontend/.env.example`:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_KEY` (Production only)
   - `AZURE_BACKEND_URL`, `AZURE_API_SECRET_KEY`
   - `GEMINI_API_KEY`, `GEMINI_MODEL` (tuỳ chọn `DEEPSEEK_API_KEY`, `QWEN_API_KEY`, `MYMEMORY_EMAIL`)
5. Deploy.

Vercel tự build lại mỗi push vào main. GitHub Actions `frontend.yml` chạy song song để early-fail nếu lint/typecheck hỏng.

## 5. Xử lý sự cố

| Lỗi | Cách xử lý |
|---|---|
| Workflow `deploy` skip | Tạo variable `DEPLOY_ENABLED=true` trong Settings → Variables |
| `Permission denied (publickey)` ở SSH step | Kiểm tra `VM_SSH_KEY` đã paste đầy đủ (cả `-----BEGIN…-----`), key trên VM nằm trong `~/.ssh/authorized_keys` |
| `unauthorized` khi pull GHCR | Image private → trên VM `docker login ghcr.io -u <user> -p <PAT-with-read:packages>`. Hoặc vào Packages của repo, set Visibility = Public. |
| Backend không restart | SSH vào VM: `docker logs novel-backend --tail 100` và `docker compose -f backend/docker-compose.prod.yml ps` |
| Vercel build fail | Xem log Vercel; thường thiếu env vars. Check log GitHub Actions `frontend.yml` để biết lỗi typescript/build |

## 6. Tag image cụ thể (rollback)

GHCR tags được push gồm:
- `latest` — luôn là build mới nhất
- `sha-<7chars>` — theo commit SHA

Rollback về commit cũ:
```bash
# Trên VM
docker pull ghcr.io/khanhkhanh123abc/tomatonoveltrans-backend:sha-abc1234
# Sửa docker-compose.prod.yml image tag → restart
```
