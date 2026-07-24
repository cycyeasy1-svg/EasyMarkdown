[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$RepositoryPath,

  [string]$SourcePath = (Join-Path $PSScriptRoot '..\02-publish-to-gitlab'),

  [switch]$StageWithGit
)

$ErrorActionPreference = 'Stop'
$ExpectedProject = 'ai-hub/tools'
$ExpectedBranch = 'master'
$TargetRelativePath = 'easymarkdown/update-demo'

function Resolve-ExistingDirectory([string]$Path, [string]$Label) {
  $resolved = Resolve-Path -LiteralPath $Path -ErrorAction Stop
  $item = Get-Item -LiteralPath $resolved.Path
  if (-not $item.PSIsContainer) {
    throw "$Label is not a directory: $($resolved.Path)"
  }
  return $resolved.Path
}

$repository = Resolve-ExistingDirectory $RepositoryPath 'RepositoryPath'
$source = Resolve-ExistingDirectory $SourcePath 'SourcePath'

$gitRoot = (& git -C $repository rev-parse --show-toplevel 2>$null)
if ($LASTEXITCODE -ne 0 -or -not $gitRoot) {
  throw "RepositoryPath is not inside a Git working tree: $repository"
}
$gitRoot = (Resolve-Path -LiteralPath $gitRoot.Trim()).Path

$origin = (& git -C $gitRoot remote get-url origin 2>$null)
if ($LASTEXITCODE -ne 0 -or $origin -notmatch [regex]::Escape($ExpectedProject)) {
  throw "The origin remote is not the expected GitLab project '$ExpectedProject': $origin"
}

$branch = (& git -C $gitRoot branch --show-current 2>$null).Trim()
if ($branch -ne $ExpectedBranch) {
  throw "The current branch must be '$ExpectedBranch' before copying the feed. Current: '$branch'"
}

$latestPath = Join-Path $source 'latest.yml'
if (-not (Test-Path -LiteralPath $latestPath -PathType Leaf)) {
  throw "latest.yml is missing: $latestPath"
}
$latest = Get-Content -LiteralPath $latestPath -Raw -Encoding UTF8
$installerName = [regex]::Match($latest, '(?m)^path:\s*(.+?)\s*$').Groups[1].Value
$expectedVersion = [regex]::Match($latest, '(?m)^version:\s*(\S+)\s*$').Groups[1].Value
if (-not $installerName -or -not $expectedVersion) {
  throw 'latest.yml does not contain a valid version/path.'
}

$installerPath = Join-Path $source $installerName
$blockmapPath = "$installerPath.blockmap"
foreach ($file in @($installerPath, $blockmapPath)) {
  if (-not (Test-Path -LiteralPath $file -PathType Leaf)) {
    throw "Required update file is missing: $file"
  }
}

$target = Join-Path $gitRoot $TargetRelativePath
New-Item -ItemType Directory -Path $target -Force | Out-Null

# Copy the manifest last. A Git commit makes the publication atomic, and this
# order also stays safe when the target directory is inspected before commit.
Copy-Item -LiteralPath $installerPath -Destination (Join-Path $target $installerName) -Force
Copy-Item -LiteralPath $blockmapPath -Destination (Join-Path $target "$installerName.blockmap") -Force
Copy-Item -LiteralPath $latestPath -Destination (Join-Path $target 'latest.yml') -Force

if ($StageWithGit) {
  & git -C $gitRoot add -- $TargetRelativePath
  if ($LASTEXITCODE -ne 0) {
    throw 'git add failed.'
  }
}

Write-Host ''
Write-Host "Update Demo $expectedVersion was copied to:"
Write-Host "  $target"
Write-Host ''
Write-Host 'No commit or push was performed.'
Write-Host "Inspect with: git -C `"$gitRoot`" status --short"
