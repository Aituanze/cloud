@echo off
cd /d "%~dp0"
echo ============================== >> pipeline_log.txt
echo %date% %time% >> pipeline_log.txt
".venv\Scripts\python.exe" pipeline.py >> pipeline_log.txt 2>&1
