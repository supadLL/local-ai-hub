#!/usr/bin/env sh
set -eu

IMAGE="${LOCAL_AI_HUB_IMAGE:-ghcr.io/supadll/local-ai-hub:latest}"
PORT="${PORT:-4100}"
DATA_DIR="${LOCAL_AI_HUB_DATA_DIR:-$PWD/data}"

mkdir -p "$DATA_DIR"

docker run --rm -it \
  --name local-ai-hub \
  -p "$PORT:4100" \
  -e HOST=0.0.0.0 \
  -e PORT=4100 \
  -e DATA_FILE=/app/data/state.json \
  -v "$DATA_DIR:/app/data" \
  "$IMAGE"
