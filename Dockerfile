# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
# Optional CA for a corporate/managed build proxy; never stored in image layers.
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; \
    npm ci --strict-ssl=true
COPY . .
RUN npm run check && npm test && npm run build

FROM ubuntu:24.04 AS runtime
ARG BAMBU_URL=https://github.com/bambulab/BambuStudio/releases/download/v02.08.02.61/BambuStudio_ubuntu24.04-v02.08.02.61-20260820225108.AppImage
ARG BAMBU_SHA256=d501b103fac5424513ec0e8d6bc145fb30719de2c7d94d7320d723740c81a7fd
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl xvfb xauth libgtk-3-0t64 libwebkit2gtk-4.1-0 \
    libgstreamer1.0-0 libgstreamer-plugins-base1.0-0 libglu1-mesa libgl1 \
    libnss3 libasound2t64 libfuse2 \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /opt/bambu
RUN --mount=type=secret,id=proxy_ca \
    set -eu; \
    if [ -f /run/secrets/proxy_ca ]; then export CURL_CA_BUNDLE=/run/secrets/proxy_ca; fi; \
    curl --fail --location --retry 3 "$BAMBU_URL" -o BambuStudio.AppImage; \
    printf '%s  BambuStudio.AppImage\n' "$BAMBU_SHA256" | sha256sum --check --strict; \
    chmod +x BambuStudio.AppImage; \
    ./BambuStudio.AppImage --appimage-extract > /dev/null; \
    rm BambuStudio.AppImage
COPY --from=build /usr/local/bin/node /usr/local/bin/node
COPY --from=build /app /app
COPY deploy/bambu-headless.sh /opt/bambu/headless
RUN chmod 755 /opt/bambu/headless && \
    useradd --uid 1001 --create-home --shell /bin/bash laminador && \
    mkdir -p /projects /jobs && chown 1001:1001 /projects /jobs
ENV BAMBU_STUDIO_PATH=/opt/bambu/headless \
    PROJECTS_DIR=/projects JOBS_DIR=/jobs HOME=/home/laminador \
    HTTP_BIND_HOST=0.0.0.0 PORT=4319
WORKDIR /app
USER laminador
EXPOSE 4319
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD ["node", "-e", "fetch('http://127.0.0.1:4319/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]
CMD ["node", "dist/server.js"]
