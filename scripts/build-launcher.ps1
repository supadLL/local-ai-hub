$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$source = Join-Path $root "launcher\LocalAIHubLauncher.cs"
$output = Join-Path $root "LocalAIHub.exe"
$generatedDir = Join-Path $root ".local-build\launcher"
$generated = Join-Path $generatedDir "LauncherAssemblyInfo.generated.cs"

if (-not (Test-Path -LiteralPath $source)) {
  throw "Launcher source was not found: $source"
}

$candidates = @(
  (Join-Path $env:WINDIR "Microsoft.NET\Framework64\v4.0.30319\csc.exe"),
  (Join-Path $env:WINDIR "Microsoft.NET\Framework\v4.0.30319\csc.exe")
)

$csc = $candidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $csc) {
  throw "Could not find the .NET Framework C# compiler. Install .NET Framework 4.x or build this launcher on a standard Windows machine."
}

$refs = @(
  "/reference:System.IO.Compression.dll",
  "/reference:System.IO.Compression.FileSystem.dll"
)

$version = if ($env:LAH_BUILD_VERSION) { $env:LAH_BUILD_VERSION } else { "dev" }
$repo = if ($env:LAH_REPO_SLUG) { $env:LAH_REPO_SLUG } else { "supadLL/local-ai-hub" }
$sourceArchiveUrl = if ($env:LAH_SOURCE_ARCHIVE_URL) {
  $env:LAH_SOURCE_ARCHIVE_URL
} else {
  "https://github.com/$repo/archive/refs/heads/main.zip"
}

function ConvertTo-CSharpString([string] $value) {
  if ($null -eq $value) {
    return ""
  }
  return $value.Replace("\", "\\").Replace('"', '\"')
}

New-Item -ItemType Directory -Force -Path $generatedDir | Out-Null
$versionLiteral = ConvertTo-CSharpString $version
$repoLiteral = ConvertTo-CSharpString $repo
$sourceArchiveUrlLiteral = ConvertTo-CSharpString $sourceArchiveUrl
Set-Content -LiteralPath $generated -Encoding UTF8 -Value @"
using System.Reflection;

[assembly: AssemblyTitle("Local AI Hub")]
[assembly: AssemblyProduct("Local AI Hub")]
[assembly: AssemblyInformationalVersion("$versionLiteral")]
[assembly: AssemblyDescription("SourceArchiveUrl=$sourceArchiveUrlLiteral;Repo=$repoLiteral")]
"@

Write-Host "Compiling LocalAIHub.exe..."
Write-Host "Version: $version"
Write-Host "Source archive: $sourceArchiveUrl"
& $csc /nologo /target:exe /platform:anycpu /optimize+ /out:$output $refs $source $generated
if ($LASTEXITCODE -ne 0) {
  throw "csc.exe failed with exit code $LASTEXITCODE"
}

Write-Host "Created $output"
