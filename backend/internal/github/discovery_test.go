package github

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"testing"
)

func TestNativeDiscovery(t *testing.T) {
	var paths []string
	c := testClient(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.RawQuery != "" {
			t.Error("query sent")
		}
		path := strings.TrimPrefix(r.URL.Path, "/api-prefix")
		paths = append(paths, path)
		switch path {
		case "/repos/acme/project":
			json.NewEncoder(w).Encode(Repository{Name: "project", FullName: "acme/project", Owner: User{Login: "acme"}})
		case "/users/acme", "/orgs/acme":
			json.NewEncoder(w).Encode(User{Login: "acme", Type: "Organization"})
		case "/orgs/acme/repos":
			json.NewEncoder(w).Encode([]Repository{{FullName: "acme/low", Stars: 2}, {FullName: "acme/high", Stars: 200}})
		default:
			http.NotFound(w, r)
		}
	})
	for _, tc := range []struct {
		kind, query  string
		repos, users int
	}{{"repositories", "acme/project", 1, 0}, {"repositories", "acme", 2, 0}, {"users", "acme", 0, 1}, {"orgs", "acme", 0, 1}} {
		result, err := c.Search(context.Background(), tc.kind, tc.query)
		if err != nil {
			t.Fatal(err)
		}
		if len(result.Repositories) != tc.repos || len(result.Users) != tc.users {
			t.Fatalf("result=%+v", result)
		}
		if tc.query == "acme" && tc.kind == "repositories" && result.Repositories[0].Stars != 200 {
			t.Fatal("not sorted by stars")
		}
	}
	if len(paths) != 5 {
		t.Fatalf("unexpected discovery requests: %v", paths)
	}
	if _, err := c.Search(context.Background(), "users", "missing"); err == nil {
		t.Fatal("missing account succeeded")
	}
	for _, q := range []string{"", "..", "a/b/c", "a?b", "a\\b"} {
		if _, err := c.Search(context.Background(), "users", q); err == nil {
			t.Errorf("accepted %q", q)
		}
	}
}
func TestTopicHTMLAdapter(t *testing.T) {
	const page = `<html><article><h3><a href="/acme">acme</a><a href="/acme/low">low</a></h3><span id="repo-stars-counter-star" title="1,002">1k</span><p>Low &amp; safe</p><span itemprop="programmingLanguage">Go</span></article><article><h3><a href="/acme/high">high</a></h3><span id="repo-stars-counter-star" title="25,000">25k</span></article><article><h3><a href="https://evil.test/o/r">external</a><a href="/o/../secret">bad</a></h3></article><script>alert(1)</script></html>`
	c := testClient(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/web-prefix/topics/go" || r.URL.RawQuery != "" {
			t.Errorf("unexpected URL: %s", r.URL)
		}
		w.Write([]byte(page))
	})
	result, err := c.TopicRepositories(context.Background(), "go")
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Repositories) != 2 || result.Repositories[0].FullName != "acme/high" || result.Repositories[1].Description != "Low & safe" || result.Repositories[1].Language != "Go" {
		t.Fatalf("result=%+v", result)
	}
	topics, err := c.Search(context.Background(), "topics", "go")
	if err != nil {
		t.Fatal(err)
	}
	if len(topics.Topics) != 1 || topics.Topics[0].Stars != 26002 {
		t.Fatalf("topics=%+v", topics)
	}
}
