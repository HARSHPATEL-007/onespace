@echo off
cd /d "apps\web"
set PORT=3004
set NEXTAUTH_URL=http://localhost:3004
if exist .next rmdir /s /q .next
start "novadev" /min cmd /c "npx next dev -p 3004 > ..\dev-server.log 2>&1"
echo Started dev server on port 3004
