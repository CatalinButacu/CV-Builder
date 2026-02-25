#!/bin/bash
# LaTeX Resume Compile Script
# Compiles resume.tex in the current branch.
# On the 'mle' branch, resume-mle.tex should be renamed to resume.tex.
set -e

TEX_FILE="resume.tex"

if [ ! -f "$TEX_FILE" ]; then
    echo "❌ Error: $TEX_FILE not found!"
    exit 1
fi

echo "🚀 Compiling $TEX_FILE ..."
rm -f resume.aux resume.log resume.out resume.toc \
       resume.synctex.gz resume.fdb_latexmk resume.fls

pdflatex -interaction=nonstopmode -halt-on-error "$TEX_FILE"
pdflatex -interaction=nonstopmode -halt-on-error "$TEX_FILE"

if [ -f "resume.pdf" ]; then
    echo "✅ resume.pdf compiled successfully ($(du -h resume.pdf | cut -f1))"
else
    echo "❌ resume.pdf compilation failed!"
    exit 1
fi

echo "🎉 Compilation complete!"
