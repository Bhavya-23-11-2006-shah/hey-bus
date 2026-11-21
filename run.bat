@echo off
REM Start the OpsRadar API (:8000) and UI (:3000) together.
REM   run.bat          real backend
REM   run.bat --mock   UI only, replaying frontend/mocks
node "%~dp0scripts\dev.mjs" %*
