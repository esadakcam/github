# GitHub Reader

A small read-only GitHub interface for networks that reach GitHub through internal proxies. The Go backend calls configurable upstream URL prefixes. The React frontend uses only the same-origin backend: no CDN scripts, fonts, avatars, or direct GitHub downloads are needed at runtime.

## Run locally

Requires Go 1.27+ and Node.js 24+ (or a Vite-supported Node.js release).

```sh
cd backend
make run
```

In another terminal:

```sh
cd frontend
npm ci
npm run dev
```

Open http://localhost:5173. Vite forwards `/api` to port 3000. Use the backend environment variables below when launching `make run` to route requests through your proxies.

## Search behavior and the query restriction

**No request to an upstream contains query parameters. There is no catalog.** GitHub's native global search APIs require `q`, so they cannot provide global fuzzy search under this restriction. See [GitHub's search documentation](https://docs.github.com/en/rest/search/search#constructing-a-search-query).

The application uses GitHub's path-based endpoints instead:

- **Repositories:** enter any exact `owner/repo` to find that repository, or an exact account name to list that account's repositories. Account results are sorted by stars, then name.
- **Users:** enter an exact GitHub login. Clicking the result lists its repositories, with organization accounts using the organization endpoint.
- **Organizations:** enter an exact organization login and click through to its repositories.
- **Topics:** enter an exact topic slug, such as `golang`. The adapter reads `/topics/{slug}` on the configured GitHub web proxy and extracts repository cards. Clicking the topic lists that page's repositories ordered by stars. Counts and aggregated stars refer only to that page. This is an HTML compatibility adapter, so a future GitHub markup change may require updating it.

There is no predefined repository allowlist: any repository exposed by the configured GitHub API can be opened directly at `/repo/{owner}/{repo}`. Exact-name lookup does not offer global partial-name matches. Full global search would require a change to the query restriction or an actual search-capable gateway; the application does not call nonexistent GitHub search paths.

GitHub list endpoints return their **default page only**. Pagination, arbitrary server-side filters, and alternate sort parameters are unavailable because they need queries. The interface reports these limits. Browser URLs use query parameters to preserve local search, file selection, tabs, and revisions; they are never forwarded upstream.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `LISTEN_ADDR` | `:3000` | Backend listener |
| `GITHUB_API_URL` | `https://api.github.com` | REST API prefix |
| `GITHUB_RAW_URL` | `https://raw.githubusercontent.com` | Raw file prefix |
| `GITHUB_CODELOAD_URL` | `https://codeload.github.com` | ZIP download prefix |
| `GITHUB_WEB_URL` | `https://github.com` | Public topic page prefix |
| `GITHUB_TOKEN` | empty | Optional server-only API token |

Prefixes can include gateway paths, for example `https://proxy.internal/github-api`. The backend appends GitHub resource paths to that prefix. Prefixes must be HTTP(S), with no credentials, query, fragment, or traversal components. Standard `HTTP_PROXY`, `HTTPS_PROXY`, and `NO_PROXY` variables are honored by the Go transport.

The optional token is sent only to the configured REST API prefix, never to raw, codeload, or web endpoints. Redirects are not followed: configure the final proxy URLs and use canonical repository names. This prevents redirect targets from bypassing the configured prefix or introducing query parameters.

Keep credentials in the backend environment. Do not set frontend `VITE_*` variables for tokens. The interface is intended for public read-only data or an appropriately controlled internal gateway: access control for a shared service token belongs at that gateway.

## Interface

The search page stays focused on one search form, with exact-name guidance. Search results have category navigation and local sorting by stars or name; changing sort does not request the same upstream list again. Press Ctrl+K (Cmd+K on macOS) to return to search. The light/dark theme follows your system until you choose a theme, then remembers your choice in browser storage.

The repository view includes a collapsible explorer, file breadcrumbs, locally bundled read-only Monaco, word wrap, downloads, and a line-count/status bar. Theme changes apply to the editor as well as the surrounding interface. No issues or pull-request views are exposed.

Errors stay within the application shell. Rate-limited responses preserve safe rate-limit headers and return `code: "rate_limited"` plus `retry_at` when GitHub supplies a valid reset time. Search failures preserve the query and show a manual retry action; the app does not poll or automatically retry while rate limited. Access-denied responses without rate-limit evidence are shown separately.

## Backend HTTP endpoints

All endpoints accept GET only. Incoming backend query strings are rejected.

| Local path | Upstream resource |
| --- | --- |
| `/api/github/repos/{owner}/{repo}` | Repository metadata |
| `/api/github/users/{user}` | User profile |
| `/api/github/orgs/{org}` | Organization profile |
| `/api/github/users/{user}/repos` | User repository list |
| `/api/github/orgs/{org}/repos` | Organization repository list |
| `/api/github/repos/{owner}/{repo}/contents` | Root contents |
| `/api/github/repos/{owner}/{repo}/contents/{path...}` | Directory or file contents |
| `/api/github/repos/{owner}/{repo}/branches` | Branches |
| `/api/github/repos/{owner}/{repo}/tags` | Tags |
| `/api/github/repos/{owner}/{repo}/commits` | Default-branch history |
| `/api/github/repos/{owner}/{repo}/commits/{ref}` | Commit details |
| `/api/github/repos/{owner}/{repo}/git/trees/{ref}` | One Git tree |
| `/api/github/repos/{owner}/{repo}/git/blobs/{sha}` | Git blob |
| `/api/raw/{owner}/{repo}/{ref}/{path...}` | Raw file bytes |
| `/api/archive/{owner}/{repo}/{ref}` | Codeload ZIP |
| `/api/search/{type}/{term}` | Exact lookup; type is repositories, users, orgs, or topics |
| `/api/topics/{topic}` | Topic repository cards |
| `/healthz` | Backend liveness |

Escape each parameter as one URL path segment, including refs containing slashes. For raw files, escape each file path segment individually. The Contents API defaults to the default branch. `Accept: application/vnd.github.raw+json` is supported for API content requests.

The editor resolves a revision to a commit SHA, obtains its root tree, and lazily fetches child trees by SHA. Raw file and ZIP requests use the resolved commit SHA, so a moving branch cannot mix revisions. Commit history displays the default branch; commit detail views let you traverse parents without queries. Source files and commit messages are displayed as text, never executed or rendered as HTML. Text files open in a read-only Monaco editor with syntax highlighting, line numbers, selection, and find. Monaco and its worker are bundled locally; there are no runtime CDN requests. Editor instances and models are disposed when changing files. Submodules are labeled without following another upstream; symlinks show their stored content.

REST and raw responses are limited to 16 MiB, topic HTML to 8 MiB, ZIP streams to 1 GiB. Preview rendering is limited to 1 million characters or 10,000 lines; complete files remain downloadable within the raw response limit. Requests have deadlines, cancellation, and bounded server shutdown. Upstream 403/404/429 and server errors remain visible; rate-limit headers are preserved by the REST proxy.

## Production

```sh
# Set proxy variables in your shell or an untracked .env file first.
docker compose up --build
```

Open http://localhost:8080. Nginx serves the SPA and forwards `/api/` to the backend service. Both containers run as nonroot. Direct frontend deep links use the SPA fallback; missing hashed assets return 404. HTML is revalidated; hashed assets are cached immutably. The Nginx configuration includes a same-origin Content Security Policy. Monaco requires dynamically generated and inline styles, so the policy permits inline styles while scripts remain restricted to the same origin. Editor workers and fonts are served locally. Use your internal TLS gateway for production ingress.

For air-gapped deployment, build the images and fetch dependencies in a connected build environment, then transfer the images into the target network. Runtime access is only to the configured proxy prefixes. The containers do not install packages or download browser assets at startup.

Backend binaries can also be built with `make build`, including `GOOS`/`GOARCH` overrides; outputs go to `backend/bin/<os>-<arch>/`.

## Verification

```sh
cd backend
make fmt vet
make build
go mod verify
go test -race -coverprofile=coverage.out ./...

cd ../frontend
npm ci
npm run typecheck
npm run lint
npm run format:check
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Linux CI images also need Chromium's system libraries and fonts. Use `npx playwright install --with-deps chromium` in an environment with package-manager privileges. In this workspace, browser tests were run with libraries and fonts extracted locally under `/tmp`, without installing system packages.

Backend tests use local HTTP servers to verify URL prefixes, query exclusion, token isolation, redirects, errors, cancellation, topic parsing, and allowlisted routes. Frontend unit tests cover response validation, binary handling, cancellation propagation, and lazy tree interaction. Browser tests use controlled API fixtures on desktop and mobile for all search types, navigation, nested files, revision changes, downloads, read-only Monaco editing, local workers, safe text rendering, commit history, errors, empty repositories, and deep-link reloads. They do not assert availability of your real internal proxies.

Development dependency note: the TypeScript ESLint parser currently depends on minimatch 10. A scoped override pins minimatch 11.0.1 to avoid its reported glob amplification vulnerability; lint is verified with that override. ESLint 10 is used because ESLint 9 is no longer maintained.

Monaco dependency note: a scoped override pins its DOMPurify dependency to 3.4.18, which addresses the advisories in the version bundled by Monaco 0.57.
