$SourceDir = "C:\Users\User\Desktop\GRAVITY"
$ReleaseDir = "C:\Users\User\Desktop\GRAVITY_Release"

# Create directories
New-Item -ItemType Directory -Force -Path "$ReleaseDir\Source"
New-Item -ItemType Directory -Force -Path "$ReleaseDir\Compiled"

# Copy source code, excluding build/cache artifacts
$Exclude = @("node_modules", "dist", ".cache", ".agent", "GRAVITY_Release", ".git", "package.ps1")
Get-ChildItem -Path $SourceDir -Exclude $Exclude | Copy-Item -Destination "$ReleaseDir\Source" -Recurse -Force

# Copy compiled executable
Copy-Item -Path "$SourceDir\dist\Gravity-1.0.0.exe" -Destination "$ReleaseDir\Compiled\Gravity-1.0.0.exe" -Force

Write-Host "Packaging Complete!"
