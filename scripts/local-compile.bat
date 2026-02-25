@echo off
REM Local LaTeX CV Compilation Script for Windows
REM Compiles resume.tex from whatever branch is checked out.
REM On the 'mle' branch, resume-mle.tex should be renamed to resume.tex.
REM Usage: scripts\local-compile.bat

echo Starting local CV compilation with Docker...

REM Check if Docker is running
docker info >nul 2>&1
if errorlevel 1 (
    echo ERROR: Docker is not running. Please start Docker and try again.
    exit /b 1
)

REM Build the Docker image
echo Building LaTeX Docker image...
docker build -t latex-cv-compiler .
if errorlevel 1 (
    echo ERROR: Docker build failed!
    exit /b 1
)

REM Compile the resume
echo Compiling resume.tex...
docker run --rm -v "%cd%":/latex -w /latex latex-cv-compiler
if errorlevel 1 (
    echo ERROR: CV compilation failed!
    exit /b 1
)

if exist "CV_Butacu.Ionel-Catalin.pdf" (
    echo OK: CV_Butacu.Ionel-Catalin.pdf ready -- opening...
    start CV_Butacu.Ionel-Catalin.pdf
) else (
    echo ERROR: CV_Butacu.Ionel-Catalin.pdf not found after compilation!
    exit /b 1
)

echo Local compilation completed successfully!
pause