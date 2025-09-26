# Use Alpine Linux as base image for minimal size
FROM alpine:3.19

# Set environment variables
ENV PATH="/usr/local/texlive/2023/bin/x86_64-linuxmusl:${PATH}"
ENV TEXMFCACHE="/tmp/texmf-cache"

# Install system dependencies
RUN apk add --no-cache \
    perl \
    wget \
    xz \
    tar \
    fontconfig \
    freetype \
    ghostscript \
    python3 \
    py3-pip \
    curl \
    git \
    make \
    bash \
    && rm -rf /var/cache/apk/*

# Install TeX Live (minimal scheme + required packages)
RUN mkdir -p /tmp/texlive && \
    cd /tmp/texlive && \
    wget -qO- https://mirror.ctan.org/systems/texlive/tlnet/install-tl-unx.tar.gz | tar -xz --strip-components=1 && \
    echo "selected_scheme scheme-minimal" > texlive.profile && \
    echo "tlpdbopt_install_docfiles 0" >> texlive.profile && \
    echo "tlpdbopt_install_srcfiles 0" >> texlive.profile && \
    echo "TEXDIR /usr/local/texlive/2023" >> texlive.profile && \
    echo "TEXMFCONFIG ~/.texlive2023/texmf-config" >> texlive.profile && \
    echo "TEXMFHOME ~/texmf" >> texlive.profile && \
    echo "TEXMFLOCAL /usr/local/texlive/texmf-local" >> texlive.profile && \
    echo "TEXMFSYSCONFIG /usr/local/texlive/2023/texmf-config" >> texlive.profile && \
    echo "TEXMFSYSVAR /usr/local/texlive/2023/texmf-var" >> texlive.profile && \
    echo "TEXMFVAR ~/.texlive2023/texmf-var" >> texlive.profile && \
    echo "option_doc 0" >> texlive.profile && \
    echo "option_src 0" >> texlive.profile && \
    ./install-tl -profile texlive.profile && \
    rm -rf /tmp/texlive

# Install essential LaTeX packages
RUN tlmgr update --self && \
    tlmgr install \
    latex-bin \
    pdftex \
    xetex \
    luatex \
    collection-fontsrecommended \
    collection-latexrecommended \
    fontawesome \
    fontawesome5 \
    academicons \
    xcolor \
    hyperref \
    fancyhdr \
    ragged2e \
    geometry \
    enumitem \
    titlesec \
    parskip \
    setspace \
    microtype \
    babel \
    babel-english \
    cm-super \
    lm \
    && tlmgr path add \
    && rm -rf /usr/local/texlive/2023/texmf-var/web2c/tlmgr.log

# Set working directory
WORKDIR /latex

# Create compilation script
RUN echo '#!/bin/bash' > /usr/local/bin/compile-latex.sh && \
    echo 'set -e' >> /usr/local/bin/compile-latex.sh && \
    echo 'echo "🚀 Starting LaTeX compilation..."' >> /usr/local/bin/compile-latex.sh && \
    echo '' >> /usr/local/bin/compile-latex.sh && \
    echo '# Check if resume.tex exists' >> /usr/local/bin/compile-latex.sh && \
    echo 'if [ ! -f "resume.tex" ]; then' >> /usr/local/bin/compile-latex.sh && \
    echo '    echo "❌ Error: resume.tex not found!"' >> /usr/local/bin/compile-latex.sh && \
    echo '    exit 1' >> /usr/local/bin/compile-latex.sh && \
    echo 'fi' >> /usr/local/bin/compile-latex.sh && \
    echo '' >> /usr/local/bin/compile-latex.sh && \
    echo '# Clean previous builds' >> /usr/local/bin/compile-latex.sh && \
    echo 'echo "🧹 Cleaning previous build files..."' >> /usr/local/bin/compile-latex.sh && \
    echo 'rm -f *.aux *.log *.out *.toc *.synctex.gz *.fdb_latexmk *.fls' >> /usr/local/bin/compile-latex.sh && \
    echo '' >> /usr/local/bin/compile-latex.sh && \
    echo '# First compilation pass' >> /usr/local/bin/compile-latex.sh && \
    echo 'echo "📄 First compilation pass..."' >> /usr/local/bin/compile-latex.sh && \
    echo 'pdflatex -interaction=nonstopmode -halt-on-error resume.tex' >> /usr/local/bin/compile-latex.sh && \
    echo '' >> /usr/local/bin/compile-latex.sh && \
    echo '# Second compilation pass for cross-references' >> /usr/local/bin/compile-latex.sh && \
    echo 'echo "🔄 Second compilation pass..."' >> /usr/local/bin/compile-latex.sh && \
    echo 'pdflatex -interaction=nonstopmode -halt-on-error resume.tex' >> /usr/local/bin/compile-latex.sh && \
    echo '' >> /usr/local/bin/compile-latex.sh && \
    echo '# Verify PDF generation' >> /usr/local/bin/compile-latex.sh && \
    echo 'if [ -f "resume.pdf" ]; then' >> /usr/local/bin/compile-latex.sh && \
    echo '    echo "✅ PDF compilation successful!"' >> /usr/local/bin/compile-latex.sh && \
    echo '    echo "📊 File details:"' >> /usr/local/bin/compile-latex.sh && \
    echo '    ls -la resume.pdf' >> /usr/local/bin/compile-latex.sh && \
    echo '    echo "🎉 LaTeX compilation completed successfully!"' >> /usr/local/bin/compile-latex.sh && \
    echo 'else' >> /usr/local/bin/compile-latex.sh && \
    echo '    echo "❌ PDF compilation failed!"' >> /usr/local/bin/compile-latex.sh && \
    echo '    echo "📋 Check the log files for errors:"' >> /usr/local/bin/compile-latex.sh && \
    echo '    ls -la *.log 2>/dev/null || echo "No log files found"' >> /usr/local/bin/compile-latex.sh && \
    echo '    exit 1' >> /usr/local/bin/compile-latex.sh && \
    echo 'fi' >> /usr/local/bin/compile-latex.sh && \
    chmod +x /usr/local/bin/compile-latex.sh

# Default command
CMD ["/usr/local/bin/compile-latex.sh"]

# Health check to verify LaTeX installation
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD pdflatex --version || exit 1

# Labels for better container management
LABEL maintainer="CatalinButacu" \
      description="Minimal Alpine-based LaTeX compiler for CV generation" \
      version="1.0" \
      base-image="alpine:3.19"