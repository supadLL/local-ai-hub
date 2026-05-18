param(
  [string] $OutputRoot = "release"
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$template = Join-Path $root "launcher\local-ai-hub-unix.sh.template"
$outputRootPath = Join-Path $root $OutputRoot
$linuxRoot = Join-Path $outputRootPath "linux"
$macosRoot = Join-Path $outputRootPath "macos"

if (-not (Test-Path -LiteralPath $template)) {
  throw "Launcher template was not found: $template"
}

$version = if ($env:LAH_BUILD_VERSION) { $env:LAH_BUILD_VERSION } else { "dev" }
$repo = if ($env:LAH_REPO_SLUG) { $env:LAH_REPO_SLUG } else { "supadLL/local-ai-hub" }
$sourceArchiveUrl = if ($env:LAH_SOURCE_ARCHIVE_URL) {
  $env:LAH_SOURCE_ARCHIVE_URL
} else {
  "https://github.com/$repo/archive/refs/heads/main.zip"
}
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

function Render-Launcher([string] $destination) {
  $content = Get-Content -Raw -LiteralPath $template
  $content = $content.Replace("__LAH_BUILD_VERSION__", $version)
  $content = $content.Replace("__LAH_REPO_SLUG__", $repo)
  $content = $content.Replace("__LAH_SOURCE_ARCHIVE_URL__", $sourceArchiveUrl)
  [System.IO.File]::WriteAllText($destination, $content, $utf8NoBom)
}

function Write-VersionFile([string] $directory, [string] $platform) {
  [ordered]@{
    name = "local-ai-hub"
    platform = $platform
    version = $version
    repository = $repo
    sourceArchiveUrl = $sourceArchiveUrl
    builtAt = (Get-Date).ToUniversalTime().ToString("o")
  } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $directory "version.json") -Encoding UTF8
}

New-Item -ItemType Directory -Force -Path $linuxRoot, $macosRoot | Out-Null

Render-Launcher (Join-Path $linuxRoot "LocalAIHub.sh")
Render-Launcher (Join-Path $macosRoot "LocalAIHub.command")

$desktopContent = @"
[Desktop Entry]
Type=Application
Name=Local AI Hub
Comment=Start Local AI Hub
Terminal=true
Exec=sh -c 'cd "`$(dirname "`$1")" && ./LocalAIHub.sh' local-ai-hub %k
Categories=Development;
"@
[System.IO.File]::WriteAllText((Join-Path $linuxRoot "LocalAIHub.desktop"), $desktopContent, $utf8NoBom)

Copy-Item -LiteralPath (Join-Path $root "UNIX-ONE-CLICK.zh-CN.md") -Destination (Join-Path $linuxRoot "README.zh-CN.md") -Force
Copy-Item -LiteralPath (Join-Path $root "UNIX-ONE-CLICK.zh-CN.md") -Destination (Join-Path $macosRoot "README.zh-CN.md") -Force

Write-VersionFile $linuxRoot "linux"
Write-VersionFile $macosRoot "macos"

Write-Host "Created Linux launcher package files in $linuxRoot"
Write-Host "Created macOS launcher package files in $macosRoot"
