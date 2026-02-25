#!/bin/bash
# LaTeX Resume Compile Script
# Compiles resume.tex in the current branch.
# On the 'mle' branch, resume-mle.tex should be renamed to resume.tex.
set -e

TEX_FILE="resume.tex"

if [ ! -f "$TEX_FILE" ]; then
    echo "ERROR: $TEX_FILE not found!"
    exit 1
fi

echo "Compiling $TEX_FILE ..."
rm -f resume.aux resume.log resume.out resume.toc \
       resume.synctex.gz resume.fdb_latexmk resume.fls

pdflatex -interaction=nonstopmode -halt-on-error "$TEX_FILE"
pdflatex -interaction=nonstopmode -halt-on-error "$TEX_FILE"

OUTPUT_PDF="CV_Butacu.Ionel-Catalin.pdf"

if [ -f "resume.pdf" ]; then
    mv resume.pdf "$OUTPUT_PDF"
    echo "OK: $OUTPUT_PDF compiled successfully ($(du -h "$OUTPUT_PDF" | cut -f1))"
else
    echo "ERROR: Compilation failed!"
    exit 1
fi

echo "Compilation complete!"
