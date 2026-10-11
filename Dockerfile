# Use Alpine Linux as base image for minimal size
FROM alpine:3.19

# Set environment variables
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

# Install TeX Live from upstream for full package support.
# mirror.ctan.org redirects to a random mirror, and now and then one returns a
# broken file. Download to disk, check it is a valid gzip, and retry (each try
# lands on a different mirror) instead of piping straight into tar.
RUN for attempt in 1 2 3 4 5; do \
        wget -q -O /tmp/install-tl.tar.gz https://mirror.ctan.org/systems/texlive/tlnet/install-tl-unx.tar.gz && \
        gzip -t /tmp/install-tl.tar.gz && break; \
        echo "TeX Live installer download failed (attempt $attempt of 5), retrying"; \
        rm -f /tmp/install-tl.tar.gz; \
        sleep 5; \
    done && \
    tar -xzf /tmp/install-tl.tar.gz -C /tmp && \
    rm /tmp/install-tl.tar.gz && \
    cd /tmp/install-tl-* && \
    echo "selected_scheme scheme-basic" > texlive.profile && \
    echo "tlpdbopt_install_docfiles 0" >> texlive.profile && \
    echo "tlpdbopt_install_srcfiles 0" >> texlive.profile && \
    echo "TEXDIR /usr/local/texlive" >> texlive.profile && \
    echo "TEXMFLOCAL /usr/local/texlive/texmf-local" >> texlive.profile && \
    echo "TEXMFSYSCONFIG /usr/local/texlive/texmf-config" >> texlive.profile && \
    echo "TEXMFSYSVAR /usr/local/texlive/texmf-var" >> texlive.profile && \
    echo "TEXMFHOME ~/texmf" >> texlive.profile && \
    echo "option_doc 0" >> texlive.profile && \
    echo "option_src 0" >> texlive.profile && \
    ./install-tl -profile texlive.profile && \
    rm -rf /tmp/install-tl-*

# Add TeX Live to PATH and install packages
ENV PATH="/usr/local/texlive/bin/x86_64-linuxmusl:${PATH}"
RUN tlmgr install \
    fontawesome \
    fontawesome5 \
    academicons \
    xcolor \
    graphics \
    hyperref \
    fancyhdr \
    marvosym \
    ragged2e \
    geometry \
    preprint \
    enumitem \
    titlesec \
    parskip \
    setspace \
    microtype \
    babel \
    babel-english \
    cm-super \
    lm \
    pgf \
    xstring

# Set working directory
WORKDIR /latex

# Copy and install the compile script from the scripts/ folder
COPY scripts/compile-latex.sh /usr/local/bin/compile-latex.sh
RUN chmod +x /usr/local/bin/compile-latex.sh

# Default command — always compiles resume.tex from the checked-out branch
CMD ["/usr/local/bin/compile-latex.sh"]

# Health check to verify LaTeX installation
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD pdflatex --version || exit 1

# Labels for better container management
LABEL maintainer="CatalinButacu" \
      description="Minimal Alpine-based LaTeX compiler for CV generation" \
      version="1.0" \
      base-image="alpine:3.19"