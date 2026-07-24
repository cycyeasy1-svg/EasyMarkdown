[CmdletBinding()]
param(
  [string]$FeedUrl = 'http://gitlab-internal.sh/ai-hub/tools/-/raw/master/easymarkdown/update-demo/',
  [switch]$MetadataOnly,
  [switch]$KeepDownloadedFiles
)

$ErrorActionPreference = 'Stop'
$feedBase = $FeedUrl.TrimEnd('/') + '/'
$work = Join-Path ([IO.Path]::GetTempPath()) ("easymarkdown-update-demo-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $work | Out-Null

function Get-Base64Sha512([string]$Path) {
  $stream = [IO.File]::OpenRead($Path)
  try {
    $algorithm = [Security.Cryptography.SHA512]::Create()
    try {
      return [Convert]::ToBase64String($algorithm.ComputeHash($stream))
    } finally {
      $algorithm.Dispose()
    }
  } finally {
    $stream.Dispose()
  }
}

try {
  $latestLocal = Join-Path $work 'latest.yml'
  $latestUrl = [Uri]::new([Uri]$feedBase, 'latest.yml').AbsoluteUri
  Write-Host "GET $latestUrl"
  Invoke-WebRequest -Uri $latestUrl -OutFile $latestLocal -UseBasicParsing

  $latest = Get-Content -LiteralPath $latestLocal -Raw -Encoding UTF8
  $version = [regex]::Match($latest, '(?m)^version:\s*(\S+)\s*$').Groups[1].Value
  $installerName = [regex]::Match($latest, '(?m)^path:\s*(.+?)\s*$').Groups[1].Value
  $expectedSha512 = [regex]::Match($latest, '(?m)^sha512:\s*(\S+)\s*$').Groups[1].Value
  if (-not $version -or -not $installerName -or -not $expectedSha512) {
    throw 'latest.yml is not a valid electron-updater manifest. A GitLab login page or 404 response may have been returned.'
  }

  Write-Host "Manifest version: $version"
  Write-Host "Installer: $installerName"
  if ($MetadataOnly) {
    Write-Host 'Metadata check passed.'
    return
  }

  $installerLocal = Join-Path $work $installerName
  $installerUrl = [Uri]::new([Uri]$feedBase, $installerName).AbsoluteUri
  Write-Host "GET $installerUrl"
  Invoke-WebRequest -Uri $installerUrl -OutFile $installerLocal -UseBasicParsing

  $actualSha512 = Get-Base64Sha512 $installerLocal
  if ($actualSha512 -ne $expectedSha512) {
    throw 'Installer SHA-512 does not match latest.yml.'
  }

  $blockmapName = "$installerName.blockmap"
  $blockmapLocal = Join-Path $work $blockmapName
  $blockmapUrl = [Uri]::new([Uri]$feedBase, $blockmapName).AbsoluteUri
  Write-Host "GET $blockmapUrl"
  Invoke-WebRequest -Uri $blockmapUrl -OutFile $blockmapLocal -UseBasicParsing
  if ((Get-Item -LiteralPath $blockmapLocal).Length -le 0) {
    throw 'The blockmap is empty.'
  }

  Write-Host ''
  Write-Host "Feed check passed: version $version"
  Write-Host 'The manifest, installer SHA-512, and blockmap are valid.'
  if ($KeepDownloadedFiles) {
    Write-Host "Downloaded files: $work"
  }
} finally {
  if (-not $KeepDownloadedFiles -and (Test-Path -LiteralPath $work)) {
    Remove-Item -LiteralPath $work -Recurse -Force
  }
}
