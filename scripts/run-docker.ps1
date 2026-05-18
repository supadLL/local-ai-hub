$ErrorActionPreference = "Stop"

$image = if ($env:LOCAL_AI_HUB_IMAGE) { $env:LOCAL_AI_HUB_IMAGE } else { "ghcr.io/supadll/local-ai-hub:latest" }
$port = if ($env:PORT) { $env:PORT } else { "4100" }
$dataDir = if ($env:LOCAL_AI_HUB_DATA_DIR) { $env:LOCAL_AI_HUB_DATA_DIR } else { Join-Path (Get-Location) "data" }

New-Item -ItemType Directory -Force -Path $dataDir | Out-Null

docker run --rm -it `
  --name local-ai-hub `
  -p "${port}:4100" `
  -e HOST=0.0.0.0 `
  -e PORT=4100 `
  -e DATA_FILE=/app/data/state.json `
  -v "${dataDir}:/app/data" `
  $image
