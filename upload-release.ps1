param(
    [string]$Token = "",
    [string]$Version = "1.0.5",
    [string]$Repo = "Timon2306/minecraft-offline-launcher",
    [string]$FilePath = "dist\Minecraft Offline Launcher Setup 1.0.5.exe"
)

if ([string]::IsNullOrWhiteSpace($Token)) {
    Write-Host "Please provide your GitHub Personal Access Token." -ForegroundColor Yellow
    Write-Host "Example: .\upload-release.ps1 -Token `"ghp_YourTokenHere`""
    Write-Host "You can create a token at: https://github.com/settings/tokens (needs 'repo' scope)"
    exit
}

if (-not (Test-Path $FilePath)) {
    Write-Host "File not found: $FilePath" -ForegroundColor Red
    exit
}

$headers = @{
    "Authorization" = "token $Token"
    "Accept" = "application/vnd.github.v3+json"
}

Write-Host "1. Checking if release $Version exists..." -ForegroundColor Cyan

$releaseResponse = $null
try {
    $releaseResponse = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/releases/tags/v$Version" -Method Get -Headers $headers -ErrorAction Stop
    Write-Host "Release already exists. Using existing release." -ForegroundColor Yellow
} catch {
    Write-Host "Release not found. Creating new release v$Version..." -ForegroundColor Cyan
    $releaseBody = @{
        tag_name = "v$Version"
        name = "Release v$Version"
        body = "Update $Version"
        draft = $false
        prerelease = $false
    } | ConvertTo-Json
    $releaseResponse = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/releases" -Method Post -Headers $headers -Body $releaseBody -ErrorAction Stop
}

if (-not $releaseResponse -or -not $releaseResponse.upload_url) {
    Write-Host "Failed to get release upload URL!" -ForegroundColor Red
    Write-Host "API Response was:"
    $releaseResponse | ConvertTo-Json -Depth 2 | Write-Host
    exit 1
}

$uploadUrl = $releaseResponse.upload_url -replace '\{.*\}$', ''
$fileName = Split-Path $FilePath -Leaf
$encodedFileName = [uri]::EscapeDataString($fileName)

Write-Host "2. Uploading $fileName to GitHub Releases..." -ForegroundColor Cyan

$fileBytes = [System.IO.File]::ReadAllBytes((Resolve-Path $FilePath).Path)
$uploadUri = "$uploadUrl?name=$encodedFileName"

$uploadHeaders = @{
    "Authorization" = "token $Token"
    "Accept" = "application/vnd.github.v3+json"
    "Content-Type" = "application/octet-stream"
}

Write-Host "DEBUG: uploadUrl = $uploadUrl"
Write-Host "DEBUG: uploadUri = $uploadUri"

Invoke-RestMethod -Uri $uploadUri -Method Post -Headers $uploadHeaders -Body $fileBytes -ErrorAction Stop

Write-Host "Successfully uploaded the release!" -ForegroundColor Green
Write-Host "Release URL: $($releaseResponse.html_url)" -ForegroundColor Green
