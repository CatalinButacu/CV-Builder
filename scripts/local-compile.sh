#!/bin/bash

# Local LaTeX CV Compilation Script
# Compiles resume.tex from whatever branch is checked out.
# On the 'mle' branch, resume-mle.tex should be renamed to resume.tex.
# Usage: ./scripts/local-compile.sh

set -e

echo "🐳 Starting local CV compilation with Docker..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker and try again."
    exit 1
fi

# Build the Docker image
echo "🔨 Building LaTeX Docker image..."
docker build -t latex-cv-compiler .

# Compile the resume
echo "📄 Compiling resume.tex..."
docker run --rm \
    -v "$(pwd)":/latex \
    -w /latex \
    latex-cv-compiler

if [ -f "resume.pdf" ]; then
    echo "✅ resume.pdf ready ($(du -h resume.pdf | cut -f1))"
    if command -v open > /dev/null 2>&1; then
        open resume.pdf
    elif command -v xdg-open > /dev/null 2>&1; then
        xdg-open resume.pdf
    fi
else
    echo "❌ resume.pdf not found after compilation!"
    exit 1
fi

echo "🎉 Local compilation completed successfully!"