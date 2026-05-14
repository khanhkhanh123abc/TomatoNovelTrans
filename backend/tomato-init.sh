#!/bin/sh
# Ép Tomato xuất EPUB và lưu vào /data trước khi entrypoint gốc khởi động.
# Default của Tomato là novel_format=txt + save_path=./downloads, khiến file
# nằm ở /app/downloads dạng .txt — backend không thấy.
set -e
mkdir -p /data
cat > /data/config.yml <<'EOF'
novel_format: "epub"
save_path: "/data"
allow_overwrite_files: true
auto_open_downloaded_files: false
EOF
exec /app/entrypoint.sh "$@"
