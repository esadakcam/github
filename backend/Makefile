APP ?= github-reader
MAIN ?= ./cmd/server
GOOS ?= $(shell go env GOOS)
GOARCH ?= $(shell go env GOARCH)
EXT := $(if $(filter windows,$(GOOS)),.exe,)
OUT := bin/$(GOOS)-$(GOARCH)/$(APP)$(EXT)
.DEFAULT_GOAL := build
.PHONY: fmt vet run build test
fmt:
	go fmt ./...
vet:
	go vet ./...
run:
	go run "$(MAIN)"
build:
	mkdir -p "$(dir $(OUT))"
	GOOS="$(GOOS)" GOARCH="$(GOARCH)" go build -o "$(OUT)" "$(MAIN)"
test:
	go test -race ./...
