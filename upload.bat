@echo off
set /p GH_TOKEN="Enter your GitHub Token: "
node upload-release.js
pause
