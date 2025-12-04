# PowerShell script for batch scraping
# Usage: .\scrape_batch.ps1 -Limit 15 -VercelUrl "https://your-app.vercel.app"

param(
    [int]$Limit = 15,
    [string]$VercelUrl = "https://your-app.vercel.app"
)

# Set environment variables
$env:SCRAPER_API_URL = "$VercelUrl/api/scrape_hub"
$env:S3_BUCKET_NAME = "optimnow-finops-repo"
$env:AWS_REGION = "us-east-1"

# AWS credentials should be set in your environment already
if (-not $env:AWS_ACCESS_KEY_ID) {
    Write-Host "ERROR: AWS_ACCESS_KEY_ID not set. Please set it first:" -ForegroundColor Red
    Write-Host '$env:AWS_ACCESS_KEY_ID = "your-key"' -ForegroundColor Yellow
    exit 1
}

if (-not $env:AWS_SECRET_ACCESS_KEY) {
    Write-Host "ERROR: AWS_SECRET_ACCESS_KEY not set. Please set it first:" -ForegroundColor Red
    Write-Host '$env:AWS_SECRET_ACCESS_KEY = "your-secret"' -ForegroundColor Yellow
    exit 1
}

Write-Host "Starting batch scrape with limit=$Limit" -ForegroundColor Green
Write-Host "Scraper URL: $env:SCRAPER_API_URL" -ForegroundColor Cyan
Write-Host "S3 Bucket: $env:S3_BUCKET_NAME" -ForegroundColor Cyan

# Run the batch script
node scripts/run_scrape_batch.js --limit=$Limit

if ($LASTEXITCODE -eq 0) {
    Write-Host "Batch scrape completed successfully!" -ForegroundColor Green
} else {
    Write-Host "Batch scrape failed with exit code $LASTEXITCODE" -ForegroundColor Red
    exit $LASTEXITCODE
}
