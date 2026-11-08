# Native build-time transformer for cross-platform compatibility tests.
FROM --platform=$BUILDPLATFORM node:26-trixie-slim AS build_tools
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund
RUN node -e 'require("node:fs").copyFileSync(require.resolve("@esbuild/" + process.platform + "-" + process.arch + "/bin/esbuild"), "/esbuild-native")'

FROM node:26-trixie-slim AS base
RUN apt update && apt install --yes --no-install-recommends \
    curl \
    ca-certificates \
    gnupg \
    unzip \
    dumb-init \
    && install -m 0755 -d /etc/apt/keyrings \
    && curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg \
    && chmod a+r /etc/apt/keyrings/docker.gpg \
    && echo \
         "deb [arch="$(dpkg --print-architecture)" signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian \
         "$(. /etc/os-release && echo "$VERSION_CODENAME")" stable" | \
         tee /etc/apt/sources.list.d/docker.list > /dev/null \
    && apt update \
    && apt --yes --no-install-recommends install \
         docker-ce-cli \
         docker-compose-plugin \
    && rm -rf /var/lib/apt/lists/* \
    && npm install -g tsx

############################################
# Healthcheck Binary
############################################
FROM --platform=$BUILDPLATFORM golang:1.27.3-trixie AS build_healthcheck
WORKDIR /app
ARG TARGETOS
ARG TARGETARCH
COPY extra/healthcheck.go ./extra/healthcheck.go
RUN CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH go build -trimpath -o ./extra/healthcheck ./extra/healthcheck.go

############################################
# Build
############################################
FROM base AS build
RUN apt-get update && apt-get install --yes --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /app
# Link the pinned upstream SQLite statically; runtime needs no SQLite system library.
COPY extra/build-sqlite.mjs ./extra/build-sqlite.mjs
RUN node extra/build-sqlite.mjs /opt/sqlite
COPY --chown=node:node  ./package.json ./package.json
COPY --chown=node:node  ./package-lock.json ./package-lock.json
RUN PYTHON=/usr/bin/python3 npm_config_nodedir=/usr/local npm_config_build_from_source=sqlite3 npm_config_sqlite=/opt/sqlite \
    npm ci --omit=dev --foreground-scripts
# Only the native addon is needed at runtime, not the compiler intermediates.
RUN find node_modules/sqlite3/build -type f ! -path "*/Release/node_sqlite3.node" -delete
COPY tests/native-modules.test.ts tests/dependency-compatibility.test.ts tests/http-compatibility.test.ts ./tests/
COPY backend ./backend
COPY common ./common
COPY --from=build_tools /esbuild-native /tmp/esbuild-native
ARG BUILDPLATFORM
ARG TARGETPLATFORM
# Run the architecture-independent TS transformer natively when testing under QEMU.
# The runtime image retains its target-native esbuild binary.
RUN node -e 'require("node:assert/strict").equal(require("sqlite3").VERSION, "3.54.1")' \
    && if [ "$BUILDPLATFORM" != "$TARGETPLATFORM" ]; then export ESBUILD_BINARY_PATH=/tmp/esbuild-native; fi \
    && npm run test:native && npm run test:compat

############################################
# ⭐ Main Image
############################################
FROM base AS release
WORKDIR /app
COPY --chown=node:node --from=build_healthcheck /app/extra/healthcheck /app/extra/healthcheck
COPY --from=build /app/node_modules /app/node_modules
COPY --chown=node:node  . .
RUN mkdir ./data


# It is just for safe, as by default, it is disabled in the latest Node.js now.
# Read more:
# - https://github.com/sagemathinc/cocalc/issues/6963
# - https://github.com/microsoft/node-pty/issues/630#issuecomment-1987212447
ENV UV_USE_IO_URING=0

VOLUME /app/data
EXPOSE 5001
HEALTHCHECK --interval=60s --timeout=30s --start-period=60s --retries=5 CMD extra/healthcheck
ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["tsx", "./backend/index.ts"]

############################################
# Mark as Nightly
############################################
FROM release AS nightly
RUN npm run mark-as-nightly
