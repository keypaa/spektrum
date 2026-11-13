# Compile image for the render worker (spec §11.5, §10.6).
# Build once: scripts/build-texlive.sh
FROM debian:bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive \
    TEXMFVAR=/tmp/texmf \
    TEXMFHOME=/tmp/texmfhome \
    TEXMFCNF=/etc/texmf:/usr/share/texlive/texmf-dist/web2c

# TeX Live package set from spec §11.5, plus texlive-extra-utils (texcount).
RUN apt-get update && apt-get install -y --no-install-recommends \
      texlive-latex-base \
      texlive-latex-extra \
      texlive-fonts-recommended \
      texlive-science \
      texlive-pictures \
      texlive-xetex \
      texlive-luatex \
      texlive-bibtex-extra \
      texlive-lang-english \
      texlive-lang-french \
      texlive-extra-utils \
      latexmk \
    && rm -rf /var/lib/apt/lists/*

# §10.6: restricted file opening and no shell escape. Debian's kpathsea reads
# /etc/texmf, so this is the path that actually takes effect.
RUN printf 'openin_any = p\nshell_escape = f\n' > /etc/texmf/texmf.cnf

# The worker runs the container as uid/gid 10001 (spec §10.6).
RUN useradd --uid 10001 --user-group --create-home compile