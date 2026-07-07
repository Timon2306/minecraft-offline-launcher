try {
    throw "error"
} catch {
    $myVar = "Hello World"
}
Write-Host "Result: $myVar"
