param(
  [string] $Version,
  [switch] $Push
)

$ErrorActionPreference = "Stop"
$initialVersion = "v26.1.1.1"

function ConvertTo-VersionParts([string] $tag) {
  if ($tag -notmatch '^v(\d+)\.(\d+)\.(\d+)\.(\d+)$') {
    return $null
  }

  [pscustomobject]@{
    Tag = $tag
    Major = [int] $Matches[1]
    Minor = [int] $Matches[2]
    Patch = [int] $Matches[3]
    Build = [int] $Matches[4]
  }
}

function Get-NextVersion {
  git fetch --tags origin | Out-Null
  $tags = git tag --list "v*"

  $latest = $tags |
    ForEach-Object { ConvertTo-VersionParts $_ } |
    Where-Object { $null -ne $_ } |
    Sort-Object Major, Minor, Patch, Build |
    Select-Object -Last 1

  if (-not $latest) {
    return $initialVersion
  }

  return "v$($latest.Major).$($latest.Minor).$($latest.Patch).$($latest.Build + 1)"
}

if (-not $Version) {
  $Version = Get-NextVersion
}

if ($Version -notmatch '^v\d+\.\d+\.\d+\.\d+$') {
  throw "Release version must look like v26.1.1.1. Got: $Version"
}

git rev-parse --verify $Version 2>$null | Out-Null
if ($LASTEXITCODE -eq 0) {
  throw "Tag already exists locally: $Version"
}

git ls-remote --exit-code --tags origin "refs/tags/$Version" 2>$null | Out-Null
if ($LASTEXITCODE -eq 0) {
  throw "Tag already exists on origin: $Version"
}

git tag -a $Version -m "Release $Version"
Write-Host "Created tag $Version"

if ($Push) {
  git push origin $Version
  Write-Host "Pushed tag $Version to origin"
} else {
  Write-Host "Push it with: git push origin $Version"
}
