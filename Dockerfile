# The bridge needs a real glibc Node runtime: better-sqlite3, @lancedb/lancedb
# and onnxruntime (via @huggingface/transformers) publish glibc prebuilds only,
# so the Home Assistant Alpine base cannot run this add-on.
#
# Only production dependencies are installed here. Typecheck, tests, and the web
# bundle run on the workstation before `just push`; a Home Assistant appliance is
# not CI, and running tsc and Vite on the guest restarted its Supervisor once.
FROM node:22-bookworm-slim AS deps
WORKDIR /build
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# The runtime base is pinned rather than taken from BUILD_FROM: Supervisor
# supplies an empty value for a local add-on, and the Home Assistant bases are
# Alpine, which these native modules do not publish builds for.
FROM node:22-bookworm-slim
ARG BUILD_VERSION="dev"
ARG BUILD_ARCH="amd64"
LABEL io.hass.version="${BUILD_VERSION}" io.hass.type="addon" io.hass.arch="${BUILD_ARCH}" \
      org.opencontainers.image.source="https://github.com/nat-build-with-oracle/omx-grokbot" \
      org.opencontainers.image.licenses="MIT"
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates openssh-client \
    && rm -rf /var/lib/apt/lists/* \
    && npm install -g tsx@4.23.13 \
    && npm cache clean --force
WORKDIR /app
ENV NODE_ENV=production BRIDGE_DATA_DIR=/data HOME=/data PORT=8120 BRIDGE_HOST=0.0.0.0
COPY --from=deps /build/node_modules /app/node_modules
COPY package.json tsconfig.json ./
COPY dist/ ./dist/
COPY client/ ./client/
COPY server/ ./server/
COPY scripts/grokbot-gateway.py ./scripts/grokbot-gateway.py
COPY run.sh /run.sh
RUN chmod 0755 /run.sh \
    && test -f /app/dist/index.html \
    && node -e "require('better-sqlite3')" \
    && tsx --version >/dev/null
EXPOSE 8120
CMD ["/run.sh"]
