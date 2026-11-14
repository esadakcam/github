// Package github provides read-only, query-free access to configurable GitHub proxies.
package github

// User is the public profile metadata used by discovery.
type User struct {
	Login string `json:"login"`
	Name  string `json:"name,omitempty"`
	Type  string `json:"type"`
}

// Repository contains the metadata returned by discovery.
type Repository struct {
	Name          string   `json:"name"`
	FullName      string   `json:"full_name"`
	Description   string   `json:"description"`
	DefaultBranch string   `json:"default_branch"`
	Stars         int      `json:"stargazers_count"`
	Language      string   `json:"language"`
	Topics        []string `json:"topics"`
	Owner         User     `json:"owner"`
}

// Topic represents a topic on the first public topic page.
type Topic struct {
	Name         string `json:"name"`
	Stars        int    `json:"stars"`
	Repositories int    `json:"repositories"`
}

// SearchResult reports discovery results and the scope of the upstream response.
type SearchResult struct {
	Repositories []Repository `json:"repositories"`
	Users        []User       `json:"users"`
	Topics       []Topic      `json:"topics"`
	Warnings     []string     `json:"warnings"`
	Scope        string       `json:"scope"`
}
