package github

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// Config supplies trusted upstream prefixes. Prefixes may include a gateway path.
// Token is sent only to the configured REST API prefix, never to raw/codeload hosts.
type Config struct{ APIURL, RawURL, CodeloadURL, WebURL, Token string }

// Client owns a reusable HTTP client. Responses returned by its methods must be closed.
// Calls are synchronous and bounded by both the supplied context and a client timeout.
type Client struct {
	api, raw, codeload, web *url.URL
	token                   string
	http                    *http.Client
}

// NewClient validates all prefixes and clones the transport for connection reuse.
func NewClient(cfg Config) (*Client, error) {
	c := &Client{token: cfg.Token}
	for _, p := range []struct {
		value  string
		target **url.URL
	}{
		{cfg.APIURL, &c.api}, {cfg.RawURL, &c.raw}, {cfg.CodeloadURL, &c.codeload}, {cfg.WebURL, &c.web},
	} {
		u, err := url.Parse(p.value)
		if err != nil || u == nil || (u.Scheme != "https" && u.Scheme != "http") || u.Host == "" || u.User != nil || u.RawQuery != "" || u.ForceQuery || u.Fragment != "" || validatePath(u.Path) != nil {
			return nil, fmt.Errorf("invalid upstream prefix")
		}
		*p.target = u
	}
	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.ResponseHeaderTimeout = 20 * time.Second
	c.http = &http.Client{Transport: transport, Timeout: 2 * time.Minute,
		CheckRedirect: func(_ *http.Request, _ []*http.Request) error { return http.ErrUseLastResponse }}
	return c, nil
}

// Close releases idle connections; callers must first finish active requests.
func (c *Client) Close() { c.http.CloseIdleConnections() }

func validatePath(path string) error {
	for _, p := range strings.Split(path, "/") {
		if p == "." || p == ".." || strings.ContainsAny(p, "\\\x00\r\n") {
			return errors.New("invalid path segment")
		}
	}
	return nil
}

func (c *Client) get(ctx context.Context, base *url.URL, path, accept string) (*http.Response, error) {
	if !strings.HasPrefix(path, "/") {
		return nil, errors.New("path must start with slash")
	}
	decoded, err := url.PathUnescape(path)
	if err != nil || validatePath(decoded) != nil {
		return nil, errors.New("invalid upstream path")
	}
	u := *base
	u.Path = strings.TrimRight(base.Path, "/") + decoded
	u.RawPath = strings.TrimRight(base.EscapedPath(), "/") + path
	// Construct URLs structurally: search text, refs and paths can never become a query.
	u.RawQuery, u.Fragment, u.ForceQuery = "", "", false
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "airgap-github-reader")
	req.Header.Set("Accept", accept)
	if base == c.api {
		req.Header.Set("X-GitHub-Api-Version", "2022-11-28")
		if c.token != "" {
			req.Header.Set("Authorization", "Bearer "+c.token)
		}
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request upstream: %w", err)
	}
	return resp, nil
}

// API performs a query-free REST GET. The caller owns the response body, including errors.
// The HTTP adapter must allowlist paths before calling this method.
func (c *Client) API(ctx context.Context, path, accept string) (*http.Response, error) {
	if accept != "application/vnd.github.raw+json" {
		accept = "application/vnd.github+json"
	}
	return c.get(ctx, c.api, path, accept)
}

// Raw returns file bytes at an immutable commit or a branch/tag ref. Each argument is escaped.
func (c *Client) Raw(ctx context.Context, owner, repo, ref, path string) (*http.Response, error) {
	parts := []string{owner, repo, ref}
	parts = append(parts, strings.Split(path, "/")...)
	for i := range parts {
		parts[i] = url.PathEscape(parts[i])
	}
	return c.get(ctx, c.raw, "/"+strings.Join(parts, "/"), "application/octet-stream")
}

// Archive streams a ZIP from codeload using its path-based endpoint (no legacy redirects).
func (c *Client) Archive(ctx context.Context, owner, repo, ref string) (*http.Response, error) {
	return c.get(ctx, c.codeload, "/"+url.PathEscape(owner)+"/"+url.PathEscape(repo)+"/zip/"+url.PathEscape(ref), "application/zip")
}

// Web returns a query-free GitHub web resource through its configured prefix.
func (c *Client) Web(ctx context.Context, path string) (*http.Response, error) {
	return c.get(ctx, c.web, path, "text/html")
}

// UpstreamError reports a non-success upstream status without exposing credentials or bodies.
type UpstreamError struct {
	Status     int
	Remaining  string
	Reset      string
	RetryAfter string
}

// NewUpstreamError retains only status and public rate-limit headers from a response.
// It does not read the body; ownership stays with the caller.
func NewUpstreamError(resp *http.Response) *UpstreamError {
	return &UpstreamError{Status: resp.StatusCode, Remaining: resp.Header.Get("X-RateLimit-Remaining"), Reset: resp.Header.Get("X-RateLimit-Reset"), RetryAfter: resp.Header.Get("Retry-After")}
}

func (e *UpstreamError) Error() string { return fmt.Sprintf("GitHub returned HTTP %d", e.Status) }

func decodeResponse[T any](resp *http.Response) (T, error) {
	var value T
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return value, NewUpstreamError(resp)
	}
	data, err := io.ReadAll(io.LimitReader(resp.Body, (16<<20)+1))
	if err != nil {
		return value, err
	}
	if len(data) > 16<<20 {
		return value, errors.New("upstream response exceeds 16 MiB")
	}
	if err := json.Unmarshal(data, &value); err != nil {
		return value, fmt.Errorf("decode upstream: %w", err)
	}
	return value, nil
}

// Repository retrieves repository metadata for exact-name discovery.
func (c *Client) Repository(ctx context.Context, owner, repo string) (Repository, error) {
	resp, err := c.API(ctx, "/repos/"+url.PathEscape(owner)+"/"+url.PathEscape(repo), "")
	if err != nil {
		return Repository{}, err
	}
	return decodeResponse[Repository](resp)
}

// User retrieves a user (including organization accounts) by exact login.
func (c *Client) User(ctx context.Context, login string) (User, error) {
	resp, err := c.API(ctx, "/users/"+url.PathEscape(login), "")
	if err != nil {
		return User{}, err
	}
	return decodeResponse[User](resp)
}

// Repositories retrieves the upstream default page of a user's or organization's repositories.
func (c *Client) Repositories(ctx context.Context, login string, org bool) ([]Repository, error) {
	prefix := "/users/"
	if org {
		prefix = "/orgs/"
	}
	resp, err := c.API(ctx, prefix+url.PathEscape(login)+"/repos", "")
	if err != nil {
		return nil, err
	}
	return decodeResponse[[]Repository](resp)
}
