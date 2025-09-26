#!/bin/bash

# Local LaTeX CV Compilation Script
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

# Compile the CV
echo "📄 Compiling CV..."
docker run --rm \
    -v "$(pwd)":/latex \
    -w /latex \
    latex-cv-compiler

# Check if PDF was generated
if [ -f "resume.pdf" ]; then
    echo "✅ CV compiled successfully!"
    echo "📊 PDF Info:"
    ls -la resume.pdf
    echo "📏 PDF Size: $(du -h resume.pdf | cut -f1)"
    
    # Open PDF if on macOS or Linux with GUI
    if command -v open > /dev/null 2>&1; then
        echo "🔍 Opening PDF..."
        open resume.pdf
    elif command -v xdg-open > /dev/null 2>&1; then
        echo "🔍 Opening PDF..."
        xdg-open resume.pdf
    fi
else
    echo "❌ PDF compilation failed!"
    exit 1
fi

echo "🎉 Local compilation completed successfully!"