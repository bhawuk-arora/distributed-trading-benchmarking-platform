# run_local_demo.ps1: Automated runner script for local end-to-end testing.
# This script spins up the entire platform locally, triggers a load test, and opens the dashboard.

# Ensure we terminate background jobs on exit
$bgJobs = @()
function Cleanup {
    Write-Host "`n=== Cleaning Up Background Processes ===" -ForegroundColor Yellow
    foreach ($job in $bgJobs) {
        if ($job) {
            Stop-Process -Id $job.Id -Force -ErrorAction SilentlyContinue
        }
    }
    Write-Host "Done." -ForegroundColor Green
}
trap { Cleanup; exit }

Write-Host "=== 1. Starting Database & Observability Stack ===" -ForegroundColor Cyan
docker-compose -f infrastructure/deployments/docker-compose.yml up -d
if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to start Docker Compose. Make sure Docker Desktop is running." -ForegroundColor Red
    exit 1
}

Write-Host "`n=== 2. Starting Leaderboard Service (Background) ===" -ForegroundColor Cyan
$leaderboardProc = Start-Process go -ArgumentList "run ./cmd/leaderboard-service --port 8282" -WorkingDirectory backend -PassThru -NoNewWindow
$bgJobs += $leaderboardProc

Write-Host "`n=== 3. Starting Matching Engine (Background) ===" -ForegroundColor Cyan
$engineProc = Start-Process go -ArgumentList "run ./cmd/matching-engine --port 8080" -WorkingDirectory backend -PassThru -NoNewWindow
$bgJobs += $engineProc

Write-Host "`nWaiting 5 seconds for services to bind to ports..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

# Open browser to leaderboard dashboard
Write-Host "`n=== 4. Opening Leaderboard Dashboard in Browser ===" -ForegroundColor Cyan
Start-Process "http://localhost:8282"

Write-Host "`n=== 5. Running High-Throughput Load Generator (Foreground) ===" -ForegroundColor Cyan
Write-Host "Generating 1500 TPS for 15 seconds..." -ForegroundColor Yellow
Push-Location backend
go run ./cmd/load-generator -endpoint http://localhost:8080 -tps 1500 -duration 15s -bots 5
Pop-Location

Write-Host "`n=== 6. Execution Finished ===" -ForegroundColor Green
Cleanup
Write-Host "`nDemo run completed successfully!" -ForegroundColor Green
