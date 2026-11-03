param(
    [string]$Message = "Update Guitar Respec OS ($(Get-Date -Format 'yyyy-MM-dd HH:mm'))"
)
git add .
git commit -m "$Message"
git push
Write-Host "Pushed to GitHub! Cloudflare Pages is now deploying your update." -ForegroundColor Cyan
