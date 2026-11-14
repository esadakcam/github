package httpapi

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"

	"github.local/reader/internal/github"
)

func setup(t *testing.T, upstream http.HandlerFunc) http.Handler {
	t.Helper()
	server := httptest.NewServer(upstream)
	t.Cleanup(server.Close)
	client, err := github.NewClient(github.Config{APIURL: server.URL + "/api", RawURL: server.URL + "/raw", CodeloadURL: server.URL + "/zip", WebURL: server.URL + "/web"})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(client.Close)
	return Handler(client)
}
func TestProxyRoutes(t *testing.T) {
	routes := []string{"/repos/o/r", "/users/u", "/orgs/o", "/users/u/repos", "/orgs/o/repos", "/repos/o/r/contents", "/repos/o/r/contents/dir/file.txt", "/repos/o/r/branches", "/repos/o/r/tags", "/repos/o/r/commits", "/repos/o/r/commits/feature%2Fx", "/repos/o/r/git/trees/sha", "/repos/o/r/git/blobs/sha"}
	for _, path := range routes {
		t.Run(path, func(t *testing.T) {
			h := setup(t, func(w http.ResponseWriter, r *http.Request) {
				if r.URL.EscapedPath() != "/api"+path || r.URL.RawQuery != "" || r.Method != "GET" {
					t.Errorf("request=%s %s", r.Method, r.URL)
				}
				w.Write([]byte(`{"preserved":true}`))
			})
			rec := httptest.NewRecorder()
			h.ServeHTTP(rec, httptest.NewRequest("GET", "/api/github"+path, nil))
			if rec.Code != 200 || rec.Body.String() != `{"preserved":true}` {
				t.Fatalf("response=%d %s", rec.Code, rec.Body)
			}
		})
	}
}
func TestRejectionsNeverCallUpstream(t *testing.T) {
	var count atomic.Int32
	h := setup(t, func(w http.ResponseWriter, r *http.Request) { count.Add(1) })
	for _, tc := range []struct {
		method, path string
		status       int
	}{{"POST", "/api/github/repos/o/r", 405}, {"HEAD", "/healthz", 405}, {"GET", "/api/github/repos/o/r?q=x", 400}, {"GET", "/api/github/repos/o/r?", 400}, {"GET", "/api/github/repos/o/r/actions", 404}, {"GET", "/api/github/search/repositories", 404}, {"GET", "/api/github/repos/o/r/issues", 404}, {"GET", "/api/github/repos/o/r/issues/1", 404}, {"GET", "/api/github/repos/o/r/pulls", 404}, {"GET", "/api/github/repos/o/r/pulls/1", 404}, {"GET", "/api/search/users/a%3Fb", 400}} {
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, httptest.NewRequest(tc.method, tc.path, nil))
		if rec.Code != tc.status {
			t.Errorf("%s %s: got %d, want %d", tc.method, tc.path, rec.Code, tc.status)
		}
	}
	if count.Load() != 0 {
		t.Fatal("rejected request reached upstream")
	}
}
func TestBytesAndArchive(t *testing.T) {
	h := setup(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.RawQuery != "" {
			t.Error("query sent")
		}
		if r.URL.Path == "/raw/o/r/sha/dir/file.bin" {
			w.Write([]byte{0, 1, 2, 255})
			return
		}
		if r.URL.Path != "/zip/o/r/zip/sha" {
			t.Errorf("path=%s", r.URL.Path)
		}
		w.Write([]byte("PKzip"))
	})
	for _, path := range []string{"/api/raw/o/r/sha/dir/file.bin", "/api/archive/o/r/sha"} {
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, httptest.NewRequest("GET", path, nil))
		if rec.Code != 200 {
			t.Fatal(rec.Code)
		}
		if strings.Contains(path, "archive") && rec.Header().Get("Content-Disposition") == "" {
			t.Fatal("missing attachment header")
		}
		if strings.Contains(path, "raw") && rec.Body.String() != string([]byte{0, 1, 2, 255}) {
			t.Fatal("bytes changed")
		}
		if rec.Header().Get("X-Content-Type-Options") != "nosniff" {
			t.Fatal("missing security header")
		}
	}
}
func TestUpstreamErrorsAndRedirects(t *testing.T) {
	for _, status := range []int{404, 403, 429, 500, 302} {
		t.Run(http.StatusText(status), func(t *testing.T) {
			h := setup(t, func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Retry-After", "30")
				w.Header().Set("Location", "https://github.com/escape?q=x")
				w.WriteHeader(status)
				w.Write([]byte("private upstream body"))
			})
			rec := httptest.NewRecorder()
			h.ServeHTTP(rec, httptest.NewRequest("GET", "/api/github/repos/o/r", nil))
			want := status
			if status == 302 {
				want = 502
			}
			if rec.Code != want {
				t.Fatal(rec.Code)
			}
			var body map[string]string
			if json.Unmarshal(rec.Body.Bytes(), &body) != nil || strings.Contains(rec.Body.String(), "private upstream") {
				t.Fatal("unsafe error")
			}
			if rec.Header().Get("Location") != "" {
				t.Fatal("redirect escaped")
			}
		})
	}
}

func TestDiscoveryAndHealthRoutes(t *testing.T) {
	h := setup(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/repos/o/r" {
			w.Write([]byte(`{"name":"r","full_name":"o/r","owner":{"login":"o"}}`))
			return
		}
		http.NotFound(w, r)
	})
	for _, tc := range []struct {
		path   string
		status int
	}{{"/healthz", 200}, {"/api/search/repositories/o%2Fr", 200}, {"/api/search/users/missing", 404}, {"/api/search/unknown/name", 400}, {"/api/topics/%3F", 400}} {
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, httptest.NewRequest("GET", tc.path, nil))
		if rec.Code != tc.status {
			t.Errorf("%s: got %d, want %d", tc.path, rec.Code, tc.status)
		}
	}
}

func TestResponseSizeLimits(t *testing.T) {
	h := setup(t, func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/zip/") {
			w.Header().Set("Content-Length", "1073741825")
			return
		}
		w.Write([]byte(strings.Repeat("x", (16<<20)+1)))
	})
	for _, tc := range []struct {
		path   string
		status int
	}{{"/api/raw/o/r/sha/file", 413}, {"/api/archive/o/r/sha", 413}, {"/api/github/repos/o/r", 502}} {
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, httptest.NewRequest("GET", tc.path, nil))
		if rec.Code != tc.status {
			t.Errorf("%s: got %d, want %d", tc.path, rec.Code, tc.status)
		}
	}
}

func TestRateLimitDetailsReachSearchAndAPI(t *testing.T) {
	for _, path := range []string{"/api/search/users/acme", "/api/github/users/acme"} {
		t.Run(path, func(t *testing.T) {
			h := setup(t, func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("X-RateLimit-Remaining", "0")
				w.Header().Set("X-RateLimit-Reset", "1794681781")
				w.WriteHeader(403)
				w.Write([]byte(`{"message":"private upstream details"}`))
			})
			rec := httptest.NewRecorder()
			h.ServeHTTP(rec, httptest.NewRequest("GET", path, nil))
			if rec.Code != 403 || rec.Header().Get("X-RateLimit-Reset") != "1794681781" {
				t.Fatalf("status/headers=%d %v", rec.Code, rec.Header())
			}
			var body map[string]string
			if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
				t.Fatal(err)
			}
			if body["code"] != "rate_limited" || body["retry_at"] != "2026-11-14T18:43:01Z" || strings.Contains(body["message"], "private") {
				t.Fatalf("body=%v", body)
			}
		})
	}
}
func TestForbiddenIsNotAlwaysRateLimited(t *testing.T) {
	h := setup(t, func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(403) })
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest("GET", "/api/search/users/acme", nil))
	var body map[string]string
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body["code"] != "forbidden" || body["retry_at"] != "" {
		t.Fatalf("body=%v", body)
	}
}
