---
title: Tomato Novel Backend
emoji: 🍅
colorFrom: red
colorTo: green
sdk: docker
app_port: 7860
pinned: false
short_description: Backend dịch truyện Trung→Việt (Tomato + Express + Supabase)
---

# Tomato Novel Backend

Backend tự động sync truyện từ Tomato Novel Downloader vào Supabase. Đứng trước nó là frontend Next.js trên Vercel.

## Kiến trúc trong container

- **Tomato Novel Downloader** (Rust, port `18423` nội bộ) — bind `127.0.0.1`, không expose ra ngoài
- **DS2API** (Go, port `5001` nội bộ) — DeepSeek OpenAI-compatible bridge, không expose trực tiếp
- **Express backend** (Node 20, port `7860` public) — gọi Tomato qua localhost, sync Supabase, cron 8h
- Các tiến trình do `supervisord` quản lý

## Secrets cần khai báo (Settings → Variables and secrets → New secret)

| Secret | Bắt buộc | Ghi chú |
|---|---|---|
| `SUPABASE_URL` | ✅ | URL project Supabase |
| `SUPABASE_SERVICE_KEY` | ✅ | service-role key |
| `API_SECRET_KEY` | ✅ | random string — frontend Vercel dùng làm `x-api-key` |
| `TOMATO_WEB_PASSWORD` | optional | bảo vệ Tomato WebUI nội bộ |
| `DS2API_CONFIG_JSON` | optional | JSON/Base64 config DS2API; chứa `keys` + DeepSeek `accounts` |
| `DS2API_ADMIN_KEY` | optional | admin key nội bộ, mặc định `internal-only` |
| `CRON_SCHEDULE` | optional | mặc định `0 */8 * * *` |

## Endpoint

- `GET  /api/health` — không cần auth
- `POST /api/ds2api/v1/chat/completions` — proxy đến DS2API nội bộ, cần auth
- Tất cả endpoint khác cần header `x-api-key: <API_SECRET_KEY>`

URL: `https://<HF_USERNAME>-<SPACE_NAME>.hf.space`

DS2API startup forces `current_input_file.enabled=false` so novel text is sent
through chat completions directly instead of being uploaded as a temporary file.
This avoids DeepSeek bridge errors like `upload current user input file`.

## Ghi chú về storage

Free HF Space dùng ephemeral disk — file EPUB Tomato tải về có thể mất khi Space restart. Không vấn đề vì nội dung chương đã ghi sang Supabase ngay sau khi parse.
