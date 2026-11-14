package github

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"

	"golang.org/x/net/html"
)

// ErrInvalidInput identifies an invalid discovery kind or resource name.
var ErrInvalidInput = errors.New("invalid discovery input")

// ValidName checks a GitHub resource name.
func ValidName(name string) bool {
	if name == "" || name == "." || name == ".." || len(name) > 100 {
		return false
	}
	for _, c := range name {
		if !((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '-' || c == '_' || c == '.') {
			return false
		}
	}
	return true
}
func emptyResult(scope string) SearchResult {
	return SearchResult{Repositories: []Repository{}, Users: []User{}, Topics: []Topic{}, Warnings: []string{}, Scope: scope}
}

// Search resolves exact GitHub names without an index or upstream query parameters.
// Repositories accept owner/repo, or an account name to list that account's repositories.
// Users and organizations resolve exact logins. Topics use the public topic HTML page.
// GitHub has no native query-free global fuzzy search endpoint.
func (c *Client) Search(ctx context.Context, kind, query string) (SearchResult, error) {
	query = strings.TrimSpace(query)
	result := emptyResult("Exact-name matches")
	if kind == "repositories" {
		p := strings.Split(query, "/")
		if len(p) == 2 && ValidName(p[0]) && ValidName(p[1]) {
			repo, err := c.Repository(ctx, p[0], p[1])
			if err != nil {
				return result, err
			}
			result.Repositories = append(result.Repositories, repo)
			return result, nil
		}
		if !ValidName(query) {
			return result, fmt.Errorf("%w: enter owner/repo or an account name", ErrInvalidInput)
		}
		user, err := c.User(ctx, query)
		if err != nil {
			return result, err
		}
		repos, err := c.Repositories(ctx, user.Login, user.Type == "Organization")
		if err != nil {
			return result, err
		}
		result.Repositories = repos
		result.Scope = "First page of account repositories, ordered by stars"
		sortRepositories(result.Repositories)
		return result, nil
	}
	if !ValidName(query) {
		return result, fmt.Errorf("%w: enter an exact account name or topic slug", ErrInvalidInput)
	}
	switch kind {
	case "users":
		user, err := c.User(ctx, query)
		if err != nil {
			return result, err
		}
		result.Users = append(result.Users, user)
	case "orgs":
		resp, err := c.API(ctx, "/orgs/"+url.PathEscape(query), "")
		if err != nil {
			return result, err
		}
		user, err := decodeResponse[User](resp)
		if err != nil {
			return result, err
		}
		user.Type = "Organization"
		result.Users = append(result.Users, user)
	case "topics":
		repos, err := c.TopicRepositories(ctx, query)
		if err != nil {
			return result, err
		}
		if len(repos.Repositories) > 0 {
			stars := 0
			for _, repo := range repos.Repositories {
				stars += repo.Stars
			}
			result.Topics = append(result.Topics, Topic{Name: query, Stars: stars, Repositories: len(repos.Repositories)})
		}
		result.Scope = "Exact topic slug; counts and stars cover the first GitHub topic page"
	default:
		return result, fmt.Errorf("%w: unknown search type", ErrInvalidInput)
	}
	return result, nil
}

// TopicRepositories extracts the first public topic page. GitHub HTML is a compatibility
// fallback because its REST topic search requires q. Only text and validated names escape
// the parser; upstream markup and links are never served to the browser.
func (c *Client) TopicRepositories(ctx context.Context, topic string) (SearchResult, error) {
	result := emptyResult("First page of topic repositories, ordered by stars")
	if !ValidName(topic) {
		return result, fmt.Errorf("%w: invalid topic slug", ErrInvalidInput)
	}
	resp, err := c.Web(ctx, "/topics/"+url.PathEscape(topic))
	if err != nil {
		return result, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return result, NewUpstreamError(resp)
	}
	data, err := io.ReadAll(io.LimitReader(resp.Body, (8<<20)+1))
	if err != nil {
		return result, err
	}
	if len(data) > 8<<20 {
		return result, errors.New("topic page exceeds 8 MiB")
	}
	root, err := html.Parse(strings.NewReader(string(data)))
	if err != nil {
		return result, err
	}
	seen := map[string]bool{}
	walk(root, func(node *html.Node) {
		if node.Type != html.ElementNode || node.Data != "article" {
			return
		}
		var repo Repository
		walk(node, func(child *html.Node) {
			if child.Type != html.ElementNode {
				return
			}
			if child.Data == "h3" {
				walk(child, func(a *html.Node) {
					if a.Data != "a" {
						return
					}
					p := strings.Split(strings.TrimPrefix(attribute(a, "href"), "/"), "/")
					if len(p) == 2 && ValidName(p[0]) && ValidName(p[1]) {
						repo.Name = p[1]
						repo.FullName = p[0] + "/" + p[1]
						repo.Owner = User{Login: p[0], Type: "User"}
					}
				})
			}
			if attribute(child, "id") == "repo-stars-counter-star" {
				repo.Stars, _ = strconv.Atoi(strings.ReplaceAll(attribute(child, "title"), ",", ""))
			}
			if child.Data == "p" && repo.Description == "" {
				repo.Description = strings.TrimSpace(nodeText(child))
			}
			if attribute(child, "itemprop") == "programmingLanguage" {
				repo.Language = strings.TrimSpace(nodeText(child))
			}
		})
		if repo.FullName != "" && !seen[repo.FullName] {
			repo.Topics = []string{topic}
			result.Repositories = append(result.Repositories, repo)
			seen[repo.FullName] = true
		}
	})
	sortRepositories(result.Repositories)
	return result, nil
}
func sortRepositories(repos []Repository) {
	sort.Slice(repos, func(i, j int) bool {
		if repos[i].Stars != repos[j].Stars {
			return repos[i].Stars > repos[j].Stars
		}
		return repos[i].FullName < repos[j].FullName
	})
}
func attribute(n *html.Node, key string) string {
	for _, a := range n.Attr {
		if a.Key == key {
			return a.Val
		}
	}
	return ""
}
func walk(n *html.Node, visit func(*html.Node)) {
	visit(n)
	for child := n.FirstChild; child != nil; child = child.NextSibling {
		walk(child, visit)
	}
}
func nodeText(n *html.Node) string {
	var text strings.Builder
	walk(n, func(child *html.Node) {
		if child.Type == html.TextNode {
			text.WriteString(child.Data)
		}
	})
	return text.String()
}
