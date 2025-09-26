@echo off
REM Local LaTeX CV Compilation Script for Windows
REM Usage: scripts\local-compile.bat

echo 🐳 Starting local CV compilation with Docker...

REM Check if Docker is running
docker info >nul 2>&1
if errorlevel 1 (
    echo ❌ Docker is not running. Please start Docker and try again.
    exit /b 1
)

REM Build the Docker image
echo 🔨 Building LaTeX Docker image...
docker build -t latex-cv-compiler .
if errorlevel 1 (
    echo ❌ Docker build failed!
    exit /b 1
)

REM Compile the CV
echo 📄 Compiling CV...
docker run --rm -v "%cd%":/latex -w /latex latex-cv-compiler
if errorlevel 1 (
    echo ❌ CV compilation failed!
    exit /b 1
)

REM Check if PDF was generated
if exist "resume.pdf" (
    echo ✅ CV compiled successfully!
    echo 📊 PDF Info:
    dir resume.pdf
    
    REM Open PDF with default application
    echo 🔍 Opening PDF...
    start resume.pdf
) else (
    echo ❌ PDF compilation failed!
    exit /b 1
)

echo 🎉 Local compilation completed successfully!
pause