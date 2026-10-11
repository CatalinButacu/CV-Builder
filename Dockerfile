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
# The installer and the packages must come from the SAME mirror: mirrors are
# not always in sync, and mirror.ctan.org hands out a different one on every
# request. So try a list of mirrors in turn, and for each one download the
# installer, check it is a valid gzip, and install from that mirror only.
RUN installed=no; \
    for mirror in \
        https://mirror.ctan.org/systems/texlive/tlnet \
        https://ftp.fau.de/ctan/systems/texlive/tlnet \
        https://mirrors.rit.edu/CTAN/systems/texlive/tlnet \
        https://ctan.math.illinois.edu/systems/texlive/tlnet \
        https://mirrors.mit.edu/CTAN/systems/texlive/tlnet; do \
        echo "Installing TeX Live from $mirror"; \
        cd /tmp && rm -rf /tmp/install-tl* /usr/local/texlive; \
        if wget -q -O /tmp/install-tl.tar.gz "$mirror/install-tl-unx.tar.gz" && \
           gzip -t /tmp/install-tl.tar.gz && \
           tar -xzf /tmp/install-tl.tar.gz -C /tmp && \
           cd /tmp/install-tl-* && \
           printf '%s\n' \
               "selected_scheme scheme-basic" \
               "tlpdbopt_install_docfiles 0" \
               "tlpdbopt_install_srcfiles 0" \
               "TEXDIR /usr/local/texlive" \
               "TEXMFLOCAL /usr/local/texlive/texmf-local" \
               "TEXMFSYSCONFIG /usr/local/texlive/texmf-config" \
               "TEXMFSYSVAR /usr/local/texlive/texmf-var" \
               "TEXMFHOME ~/texmf" \
               "option_doc 0" \
               "option_src 0" > texlive.profile && \
           ./install-tl -profile texlive.profile -repository "$mirror"; then \
            installed=yes; \
            break; \
        fi; \
        echo "That mirror failed, trying the next one"; \
        sleep 5; \
    done; \
    cd / && rm -rf /tmp/install-tl*; \
    [ "$installed" = yes ]

# Add TeX Live to PATH and install packages
ENV PATH="/usr/local/texlive/bin/x86_64-linuxmusl:${PATH}"
# The download can fail part-way on a slow mirror, so try up to three times.
RUN ok=no; \
    for attempt in 1 2 3; do \
        if tlmgr install \
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
        xstring; then \
            ok=yes; \
            break; \
        fi; \
        echo "tlmgr install failed (attempt $attempt of 3), retrying"; \
        sleep 10; \
    done; \
    [ "$ok" = yes ]

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