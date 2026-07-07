$headers = @{ 'Accept' = 'application/vnd.github.v3+json' }
$r = Invoke-RestMethod 'https://api.github.com/repos/Timon2306/minecraft-offline-launcher/releases/tags/v1.0.5' -Headers $headers
$uploadUrl = $r.upload_url -replace '\{.*\}$', ''
$fileName = "Minecraft Offline Launcher Setup 1.0.5.exe"
$encodedFileName = [uri]::EscapeDataString($fileName)
$uploadUri = "$uploadUrl?name=$encodedFileName"
Write-Host "Upload URI: $uploadUri"
