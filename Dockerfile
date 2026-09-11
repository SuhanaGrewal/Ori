FROM python:3.11-slim

WORKDIR /app

# Linux's default PyPI torch wheel bundles full CUDA toolkits (multiple
# GB) even with no GPU on the box - installing the CPU-only build first
# (see README's Linux setup note) keeps the image size/build time sane.
# Must happen before `pip install -e .`, which would otherwise pull the
# default (CUDA) wheel in as sentence-transformers' own dependency.
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu

COPY pyproject.toml README.md ./
COPY src ./src

RUN pip install --no-cache-dir -e . \
    && python -m spacy download en_core_web_lg

# Railway's proxy reaches the container over the network, not loopback -
# 0.0.0.0 is required here even though ori.webchat's own default
# (127.0.0.1) is correct for local dev.
ENV HOST=0.0.0.0
EXPOSE 8420

CMD ["python", "-m", "ori.webchat"]
