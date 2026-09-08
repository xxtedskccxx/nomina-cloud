Write-Host "Iniciando PostgreSQL en WSL..." -ForegroundColor Cyan
wsl -d Ubuntu -u root -- service postgresql start
Start-Process wsl -ArgumentList "-d", "Ubuntu", "-u", "root", "--", "sleep", "infinity" -WindowStyle Hidden -ErrorAction SilentlyContinue

Write-Host "Iniciando DB Proxy..." -ForegroundColor Cyan
Start-Process node -ArgumentList "scripts/db-proxy.cjs" -WindowStyle Hidden -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1

Write-Host "Iniciando servidores de desarrollo (Web y API)..." -ForegroundColor Green
Start-Process "http://localhost:3000/login"
npx pnpm dev
