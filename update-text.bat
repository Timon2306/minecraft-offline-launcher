@echo off
set /p GH_TOKEN="Enter your GitHub Token to update text: "
node update-release-text.js
pause
