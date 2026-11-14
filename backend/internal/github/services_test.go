package github

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func testClient(t *testing.T, handler http.HandlerFunc) *Client {
	t.Helper()
	server := httptest.NewServer(handler)
	t.Cleanup(server.Close)
	c, err := NewClient(Config{APIURL: server.URL + "/api-prefix", RawURL: server.URL + "/raw-prefix", CodeloadURL: server.URL + "/zip-prefix", WebURL: server.URL + "/web-prefix", Token: "test-token"})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(c.Close)
	return c
}
func TestPrefixesAndQueryFreeRequests(t *testing.T) {
	type observed struct{ path, query, auth string }
	requests := make(chan observed, 4)
	c := testClient(t, func(w http.ResponseWriter, r *http.Request) {
		requests <- observed{r.URL.EscapedPath(), r.URL.RawQuery, r.Header.Get("Authorization")}
		w.Write([]byte("bytes"))
	})
	calls := []struct {
		name, want, auth string
		call             func() (*http.Response, error)
	}{
		{"api", "/api-prefix/repos/o/r/contents/a%3Fb%23c", "Bearer test-token", func() (*http.Response, error) {
			return c.API(context.Background(), "/repos/o/r/contents/a%3Fb%23c", "")
		}},
		{"raw", "/raw-prefix/o/r/feature%2Fbranch/dir/a%3Fb%23c", "", func() (*http.Response, error) {
			return c.Raw(context.Background(), "o", "r", "feature/branch", "dir/a?b#c")
		}},
		{"archive", "/zip-prefix/o/r/zip/feature%2Fbranch", "", func() (*http.Response, error) { return c.Archive(context.Background(), "o", "r", "feature/branch") }},
		{"web", "/web-prefix/topics/go", "", func() (*http.Response, error) { return c.Web(context.Background(), "/topics/go") }},
	}
	for _, tc := range calls {
		t.Run(tc.name, func(t *testing.T) {
			resp, err := tc.call()
			if err != nil {
				t.Fatal(err)
			}
			resp.Body.Close()
			got := <-requests
			if got.path != tc.want || got.query != "" || got.auth != tc.auth {
				t.Fatalf("request=%+v, want %s, auth %q", got, tc.want, tc.auth)
			}
		})
	}
}
func TestRejectInvalidPrefixesAndTraversal(t *testing.T) {
	for _, prefix := range []string{"", "ftp://host", "https://u:p@host", "https://host?q=x", "https://host?", "https://host/#frag", "https://host/../api"} {
		t.Run(prefix, func(t *testing.T) {
			_, err := NewClient(Config{APIURL: prefix})
			if err == nil {
				t.Fatal("accepted invalid prefix")
			}
		})
	}
	c := testClient(t, func(w http.ResponseWriter, r *http.Request) { t.Error("invalid path reached upstream") })
	for _, path := range []string{"relative", "/repos/o/%2e%2e/secret", "/repos/o/a%5Cb", "/repos/o/a%00b", "/%zz"} {
		if resp, err := c.API(context.Background(), path, ""); err == nil {
			resp.Body.Close()
			t.Errorf("accepted %s", path)
		}
	}
}
func TestNoRedirectFollow(t *testing.T) {
	destination := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { t.Error("followed redirect") }))
	defer destination.Close()
	c := testClient(t, func(w http.ResponseWriter, r *http.Request) { http.Redirect(w, r, destination.URL+"?q=forbidden", 302) })
	resp, err := c.API(context.Background(), "/repos/o/r", "")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != 302 {
		t.Fatalf("status=%d", resp.StatusCode)
	}
}
func TestCancellation(t *testing.T) {
	started := make(chan struct{})
	stopped := make(chan struct{})
	c := testClient(t, func(w http.ResponseWriter, r *http.Request) { close(started); <-r.Context().Done(); close(stopped) })
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	done := make(chan error, 1)
	go func() {
		resp, err := c.API(ctx, "/repos/o/r", "")
		if resp != nil {
			resp.Body.Close()
		}
		done <- err
	}()
	select {
	case <-started:
	case <-time.After(3 * time.Second):
		t.Fatal("request did not start")
	}
	cancel()
	select {
	case err := <-done:
		if !errors.Is(err, context.Canceled) {
			t.Fatalf("error=%v", err)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("request did not cancel")
	}
	select {
	case <-stopped:
	case <-time.After(3 * time.Second):
		t.Fatal("upstream did not stop")
	}
}
func TestDecodeFailureAndStatus(t *testing.T) {
	for _, tc := range []struct {
		name, body string
		status     int
	}{{"malformed", "{", 200}, {"missing", "{}", 404}} {
		t.Run(tc.name, func(t *testing.T) {
			resp := &http.Response{StatusCode: tc.status, Body: io.NopCloser(strings.NewReader(tc.body))}
			_, err := decodeResponse[Repository](resp)
			if err == nil {
				t.Fatal("expected failure")
			}
			if tc.status == 404 {
				var upstream *UpstreamError
				if !errors.As(err, &upstream) || upstream.Status != 404 {
					t.Fatalf("error=%v", err)
				}
			}
		})
	}
}
