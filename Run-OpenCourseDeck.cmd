@echo off
title OpenCourseDeck Learning Studio
echo Starting OpenCourseDeck...
cd /d "%~dp0"
echo Building the app bundle (one-time / after source changes)...
call npm run build
echo Starting the local server — keep this window open, press Ctrl+C to stop.
call npm start
