# Build a static healthcheck natively for each target architecture.
FROM --platform=$BUILDPLATFORM golang:1.27.3-trixie
WORKDIR /app
ARG TARGETOS
ARG TARGETARCH
COPY ./extra/healthcheck.go ./extra/healthcheck.go
RUN CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH go build -trimpath -o ./extra/healthcheck ./extra/healthcheck.go
