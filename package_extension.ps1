$sourceDir = "e:\Source Code\UISelector2AI"
$zipFile = "e:\Source Code\UISelector2AI\UISelector2AI.zip"

# Define the files and folders to include
$includes = @(
    "manifest.json",
    "icons",
    "src"
)

# Remove existing zip file if it exists
if (Test-Path $zipFile) {
    Remove-Item $zipFile -Force
}

# Create a temporary directory for staging
$tempDir = Join-Path $env:TEMP "agentation_packaging_$(Get-Random)"
New-Item -ItemType Directory -Path $tempDir | Out-Null

try {
    # Copy files to staging directory
    foreach ($item in $includes) {
        $sourcePath = Join-Path $sourceDir $item
        $destPath = Join-Path $tempDir $item
        
        if (Test-Path $sourcePath) {
            if ((Get-Item $sourcePath).PSIsContainer) {
                Copy-Item -Path $sourcePath -Destination $tempDir -Recurse -Container
            } else {
                Copy-Item -Path $sourcePath -Destination $tempDir
            }
        } else {
            Write-Warning "File or directory not found: $item"
        }
    }

    # Compress the staging directory content to the zip file
    Compress-Archive -Path "$tempDir\*" -DestinationPath $zipFile -Force
    
    Write-Host "Extension packaged successfully: $zipFile"
}
finally {
    # Clean up temporary directory
    Remove-Item $tempDir -Recurse -Force -ErrorAction SilentlyContinue
}
