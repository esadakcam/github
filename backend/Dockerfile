# syntax=docker/dockerfile:1
ARG GO_VERSION=1.27.3
FROM --platform=$BUILDPLATFORM golang:${GO_VERSION}-alpine AS builder
ARG TARGETOS
ARG TARGETARCH
ARG TARGETVARIANT
WORKDIR /src
COPY go.mod ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS="${TARGETOS}" GOARCH="${TARGETARCH}" GOARM="${TARGETVARIANT#v}" go build -o /out/server ./cmd/server
FROM gcr.io/distroless/static-debian13:nonroot
COPY --from=builder /out/server /server
USER nonroot:nonroot
EXPOSE 3000
ENTRYPOINT ["/server"]
