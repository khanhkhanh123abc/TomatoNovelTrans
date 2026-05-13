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
- **Express backend** (Node 20, port `7860` public) — gọi Tomato qua localhost, sync Supabase, cron 8h
- Cả hai tiến trình do `supervisord` quản lý

## Secrets cần khai báo (Settings → Variables and secrets → New secret)

| Secret | Bắt buộc | Ghi chú |
|---|---|---|
| `SUPABASE_URL` | ✅ | URL project Supabase |
| `SUPABASE_SERVICE_KEY` | ✅ | service-role key |
| `API_SECRET_KEY` | ✅ | random string — frontend Vercel dùng làm `x-api-key` |
| `TOMATO_WEB_PASSWORD` | optional | bảo vệ Tomato WebUI nội bộ |
| `CRON_SCHEDULE` | optional | mặc định `0 */8 * * *` |

## Endpoint

- `GET  /api/health` — không cần auth
- Tất cả endpoint khác cần header `x-api-key: <API_SECRET_KEY>`

URL: `https://<HF_USERNAME>-<SPACE_NAME>.hf.space`

## Ghi chú về storage

Free HF Space dùng ephemeral disk — file EPUB Tomato tải về có thể mất khi Space restart. Không vấn đề vì nội dung chương đã ghi sang Supabase ngay sau khi parse.
