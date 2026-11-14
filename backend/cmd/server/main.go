package main

import (
	"context"
	"errors"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.local/reader/internal/github"
	"github.local/reader/internal/httpapi"
)

func env(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
func run() error {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	client, err := github.NewClient(github.Config{
		APIURL: env("GITHUB_API_URL", "https://api.github.com"), RawURL: env("GITHUB_RAW_URL", "https://raw.githubusercontent.com"),
		CodeloadURL: env("GITHUB_CODELOAD_URL", "https://codeload.github.com"), WebURL: env("GITHUB_WEB_URL", "https://github.com"), Token: os.Getenv("GITHUB_TOKEN"),
	})
	if err != nil {
		return err
	}
	defer client.Close()
	server := &http.Server{Addr: env("LISTEN_ADDR", ":3000"), Handler: httpapi.Handler(client), ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 10 * time.Second, WriteTimeout: 100 * time.Second, IdleTimeout: 60 * time.Second, MaxHeaderBytes: 16 << 10}
	listener, err := net.Listen("tcp", server.Addr)
	if err != nil {
		return err
	}
	done := make(chan error, 1)
	go func() { done <- server.Serve(listener) }()
	slog.Info("GitHub reader listening", "address", listener.Addr().String())
	select {
	case err := <-done:
		if errors.Is(err, http.ErrServerClosed) {
			return nil
		}
		return err
	case <-ctx.Done():
		cleanup, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := server.Shutdown(cleanup); err != nil {
			server.Close()
			<-done
			return err
		}
		if err := <-done; !errors.Is(err, http.ErrServerClosed) {
			return err
		}
		return nil
	}
}
func main() {
	if err := run(); err != nil {
		slog.Error("server stopped", "error", err)
		os.Exit(1)
	}
}
