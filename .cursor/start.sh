#!/usr/bin/env bash
# Cloud Agent boot: protocol mock (:4822) + Vite (:4821).
# Idempotent — skips services already listening. Exits 0 after ready.
set -euo pipefail
cd /workspace

MOCK_PORT=4822
VITE_PORT=4821

port_up() {
  # Prefer a TCP connect probe — `ss` is not always installed in the image.
  curl -sf --max-time 1 "http://127.0.0.1:$1/" >/dev/null 2>&1 \
    || curl -sf --max-time 1 "http://127.0.0.1:$1/health" >/dev/null 2>&1
}

if ! port_up "$MOCK_PORT"; then
  if ! tmux has-session -t worldshift_mock 2>/dev/null; then
    tmux new-session -d -s worldshift_mock \
      "cd /workspace && MOCK_API_PORT=${MOCK_PORT} npx tsx server/index.ts 2>&1 | tee /tmp/worldshift-mock.log"
  fi
fi

for _ in $(seq 1 40); do
  if curl -sf "http://127.0.0.1:${MOCK_PORT}/health" >/dev/null 2>&1; then
    break
  fi
  sleep 0.25
done
curl -sf "http://127.0.0.1:${MOCK_PORT}/health" >/dev/null

if ! port_up "$VITE_PORT"; then
  if ! tmux has-session -t worldshift_vite 2>/dev/null; then
    tmux new-session -d -s worldshift_vite \
      "cd /workspace && ENGINE_TARGET=http://127.0.0.1:${MOCK_PORT} VITE_WORLD_API_BASE_URL=http://127.0.0.1:${MOCK_PORT} VITE_WORLD_MEMORY_SOURCE=mock npx vite --host 0.0.0.0 --port ${VITE_PORT} 2>&1 | tee /tmp/worldshift-vite.log"
  fi
fi

for _ in $(seq 1 40); do
  if curl -sf "http://127.0.0.1:${VITE_PORT}/" >/dev/null 2>&1; then
    break
  fi
  sleep 0.25
done
curl -sf "http://127.0.0.1:${VITE_PORT}/" >/dev/null

echo "[worldshift-start] mock :${MOCK_PORT} and vite :${VITE_PORT} ready"
