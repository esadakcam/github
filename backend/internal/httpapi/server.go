// Package httpapi exposes an allowlisted, read-only adapter to GitHub proxies.
package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.local/reader/internal/github"
)

// Handler returns an HTTP handler. Its dependencies must outlive in-flight requests.
func Handler(client *github.Client) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/plain")
		fmt.Fprintln(w, "ok")
	})
	mux.HandleFunc("GET /api/search/{kind}/{query}", func(w http.ResponseWriter, r *http.Request) {
		result, err := client.Search(r.Context(), r.PathValue("kind"), r.PathValue("query"))
		if err != nil {
			discoveryError(w, err)
			return
		}
		writeJSON(w, 200, result)
	})
	mux.HandleFunc("GET /api/topics/{topic}", func(w http.ResponseWriter, r *http.Request) {
		result, err := client.TopicRepositories(r.Context(), r.PathValue("topic"))
		if err != nil {
			discoveryError(w, err)
			return
		}
		writeJSON(w, 200, result)
	})
	proxy := func(w http.ResponseWriter, r *http.Request) {
		resp, err := client.API(r.Context(), strings.TrimPrefix(r.URL.EscapedPath(), "/api/github"), r.Header.Get("Accept"))
		if err != nil {
			proxyError(w, err)
			return
		}
		defer resp.Body.Close()
		if !upstreamOK(w, resp) {
			return
		}
		data, err := io.ReadAll(io.LimitReader(resp.Body, (16<<20)+1))
		if err != nil || len(data) > 16<<20 {
			writeError(w, 502, "Upstream response could not be read within the 16 MiB limit")
			return
		}

		contentType := "application/json"
		if r.Header.Get("Accept") == "application/vnd.github.raw+json" {
			contentType = "application/octet-stream"
		}
		w.Header().Set("Content-Type", contentType)
		w.Write(data)
	}
	for _, pattern := range []string{
		"/repos/{owner}/{repo}", "/users/{user}", "/orgs/{org}", "/users/{user}/repos", "/orgs/{org}/repos",
		"/repos/{owner}/{repo}/contents", "/repos/{owner}/{repo}/contents/{path...}",
		"/repos/{owner}/{repo}/branches", "/repos/{owner}/{repo}/tags",
		"/repos/{owner}/{repo}/commits", "/repos/{owner}/{repo}/commits/{ref}",
		"/repos/{owner}/{repo}/git/trees/{ref}", "/repos/{owner}/{repo}/git/blobs/{sha}",
	} {
		mux.HandleFunc("GET /api/github"+pattern, proxy)
	}
	mux.HandleFunc("GET /api/raw/{owner}/{repo}/{ref}/{path...}", func(w http.ResponseWriter, r *http.Request) {
		resp, err := client.Raw(r.Context(), r.PathValue("owner"), r.PathValue("repo"), r.PathValue("ref"), r.PathValue("path"))
		if err != nil {
			proxyError(w, err)
			return
		}
		defer resp.Body.Close()
		if !upstreamOK(w, resp) {
			return
		}
		data, err := io.ReadAll(io.LimitReader(resp.Body, (16<<20)+1))
		if err != nil || len(data) > 16<<20 {
			writeError(w, 413, "File exceeds the 16 MiB preview/download limit")
			return
		}
		w.Header().Set("Content-Type", "application/octet-stream")
		w.Write(data)
	})
	mux.HandleFunc("GET /api/archive/{owner}/{repo}/{ref}", func(w http.ResponseWriter, r *http.Request) {
		resp, err := client.Archive(r.Context(), r.PathValue("owner"), r.PathValue("repo"), r.PathValue("ref"))
		if err != nil {
			proxyError(w, err)
			return
		}
		defer resp.Body.Close()
		if !upstreamOK(w, resp) {
			return
		}
		const maxArchive = 1 << 30
		if resp.ContentLength > maxArchive {
			writeError(w, 413, "Archive exceeds the 1 GiB limit")
			return
		}
		w.Header().Set("Content-Type", "application/zip")
		w.Header().Set("Content-Disposition", `attachment; filename="repository.zip"`)
		// Read one extra byte so an oversized chunked archive fails the download instead of appearing complete.
		written, err := io.Copy(w, io.LimitReader(resp.Body, maxArchive+1))
		if err != nil || written > maxArchive {
			panic(http.ErrAbortHandler)
		}
	})
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) { writeError(w, 404, "Endpoint not found") })
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Content-Security-Policy", "default-src 'none'; sandbox")
		w.Header().Set("Cache-Control", "no-store")
		if r.Method != http.MethodGet {
			w.Header().Set("Allow", "GET")
			writeError(w, 405, "Only GET is supported")
			return
		}
		if r.URL.RawQuery != "" || r.URL.ForceQuery {
			writeError(w, 400, "Query parameters are disabled; use path-based endpoints")
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), 90*time.Second)
		defer cancel()
		mux.ServeHTTP(w, r.WithContext(ctx))
	})
}

func proxyError(w http.ResponseWriter, err error) {
	if errors.Is(err, context.DeadlineExceeded) {
		writeError(w, 504, "GitHub proxy timed out")
		return
	}
	writeError(w, 502, "Could not reach the configured GitHub proxy")
}
func upstreamOK(w http.ResponseWriter, resp *http.Response) bool {
	if resp.StatusCode == 200 {
		return true
	}
	writeUpstreamError(w, github.NewUpstreamError(resp))
	return false
}
func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"message": message})
}
func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(value)
}

func discoveryError(w http.ResponseWriter, err error) {
	if errors.Is(err, github.ErrInvalidInput) {
		writeError(w, 400, err.Error())
		return
	}
	var upstream *github.UpstreamError
	if errors.As(err, &upstream) {
		writeUpstreamError(w, upstream)
		return
	}
	if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
		proxyError(w, err)
		return
	}
	writeError(w, 502, "Could not load discovery data from the configured GitHub proxy")
}

func writeUpstreamError(w http.ResponseWriter, upstream *github.UpstreamError) {
	status := upstream.Status
	if status < 400 || status > 599 {
		status = 502
	}
	for key, value := range map[string]string{"X-RateLimit-Remaining": upstream.Remaining, "X-RateLimit-Reset": upstream.Reset, "Retry-After": upstream.RetryAfter} {
		if value != "" {
			w.Header().Set(key, value)
		}
	}
	body := map[string]string{"message": fmt.Sprintf("GitHub returned HTTP %d", upstream.Status)}
	limited := (status == 403 || status == 429) && (upstream.Remaining == "0" || upstream.RetryAfter != "" || status == 429)
	if limited {
		body["code"] = "rate_limited"
		body["message"] = "GitHub's request limit has been reached. Please try again after it resets."
		if reset, err := strconv.ParseInt(upstream.Reset, 10, 64); err == nil && reset > 0 && reset < 253402300800 {
			body["retry_at"] = time.Unix(reset, 0).UTC().Format(time.RFC3339)
		} else if seconds, err := strconv.ParseInt(upstream.RetryAfter, 10, 32); err == nil && seconds >= 0 {
			body["retry_at"] = time.Now().Add(time.Duration(seconds) * time.Second).UTC().Format(time.RFC3339)
		}
	} else if status == 403 {
		body["code"] = "forbidden"
		body["message"] = "GitHub denied access to this resource."
	}
	writeJSON(w, status, body)
}
