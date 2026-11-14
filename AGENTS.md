# Go recipe

Read project instructions and `go.mod`; use features supported by the declared Go version.

## Structure and APIs

- Organize by capability; separate executable wiring from reusable behavior. Use `cmd/<command>/` and `internal/` where useful.
- Share common behavior; isolate backend details. Document exported APIs, ownership, blocking, and errors; preserve initialisms (`HTTP`, `ID`, `URL`). [Go review guidance](https://go.dev/wiki/CodeReviewComments).

## Interfaces and structs

- Prefer concrete structs and explicit ownership; define small consumer interfaces only for demonstrated needs. Avoid speculative abstractions.
- Inject dependencies; use constructors for required initialization/validation, returning concrete types and construction errors.
- Favor useful zero values; keep invariant-bearing fields private.
- Use pointer receivers for mutation/non-copyable state/large values; value receivers for small value types. Stay consistent.
- Compose through fields; embed only for intentional method promotion.
- A typed nil inside an interface is non-nil; return explicit `nil` for absence.

[Interfaces/receivers](https://go.dev/wiki/CodeReviewComments), [zero values/composition](https://go.dev/doc/effective_go), [nil interfaces](https://go.dev/doc/faq#nil_error).

## Dependencies

Prefer the standard library when sufficient. Commit `go.mod` and generated `go.sum`; review dependency changes, avoid unrelated upgrades, and pin development tools. [Modules](https://go.dev/doc/modules/managing-dependencies).

## Configuration and validation

Use typed configuration and explicit tags. Centralize documented defaults; validate fields/ranges before use and test invalid inputs. Keep examples current and choose decoding strictness without silently breaking compatibility.

## Errors and logging

Add useful context with `%w` when the cause belongs to the API contract. Inspect with `errors.Is`/`errors.As`, not strings. Use `(bool, error)` when a negative result differs from evaluation failure. [Errors](https://go.dev/blog/go1.13-errors).

Normally log errors once at the handling boundary, using consistent severity and structured attributes. Exclude credentials, tokens, and sensitive payloads. Follow the project's logger; default to `log/slog` for new applications. [Structured logging](https://pkg.go.dev/log/slog).

## Context and cleanup

- Pass context first through blocking calls. Set operation deadlines, call cancellation functions, and make waits/retries/communication cancellable; preserve cancellation causes.
- Never pass nil contexts; normally pass them explicitly rather than storing them in structs. Use context values for request-scoped metadata, not configuration or dependency injection.
- Clean up successful acquisitions and partial construction failures. Scope `defer` to resource lifetimes, including loop iterations. Post-cancellation cleanup needs a live bounded context and must finish before exit.

Create the service's parent context at entry and pass it to workers. Import `context`, `os`, `os/signal`, and `syscall`; `stop` releases signal resources:

```go
ctx, stop := signal.NotifyContext(
	context.Background(),
	os.Interrupt,
	syscall.SIGTERM,
)
defer stop()
```

[Context](https://pkg.go.dev/context), [signals](https://pkg.go.dev/os/signal#NotifyContext), [defer](https://go.dev/doc/effective_go#defer).

## Concurrency

> Do not communicate by sharing memory; instead, share memory by communicating.

- Prefer synchronous APIs. Give goroutines an owner, stop condition, and completion path; cancel and join them before releasing resources.
- Sending a pointer, slice, or map through a channel shares the referenced data. Choose explicitly: the sender stops reading and writing that data after sending; each goroutine gets an independent copy, including mutable nested data; all goroutines treat the shared data as read-only; or all reads and writes use the same mutex.
- Bound workers with a pool or `errgroup.SetLimit`; configure limits before starting work.
- Join tasks with `sync.WaitGroup`: `Add` before launch, defer `Done`. On Go 1.25+, `WaitGroup.Go` simplifies this; callbacks must not panic. For errors and sibling cancellation, use `errgroup.WithContext`, propagate its context, and return `Wait()`'s error.
- Protect shared mutable state consistently with mutexes; use atomics for independent values. Never copy used synchronization primitives.
- Let the sender/coordinator close channels after all sends finish. Make blocking sends/receives cancellable; buffering does not ensure shutdown.
- Test errors, cancellation, early consumer exit, and completion with race detection; sleeps do not synchronize.

[Effective Go](https://go.dev/doc/effective_go#sharing), [synchronous APIs](https://go.dev/wiki/CodeReviewComments#synchronous-functions), [goroutine lifetimes](https://go.dev/wiki/CodeReviewComments#goroutine-lifetimes), [sync](https://pkg.go.dev/sync), [errgroup](https://pkg.go.dev/golang.org/x/sync/errgroup), [pipelines](https://go.dev/blog/pipelines).

## HTTP, when used

- Reuse clients/transports, use `NewRequestWithContext`, bound request lifetimes, and close response bodies on every path. Long calls may use request-specific deadlines.
- Use an explicit server/mux, injected handlers, and typed payloads. Validate inputs, propagate `r.Context()`, and set headers before writing consistent status/error responses.
- Configure header/idle/body/write limits; use `MaxBytesReader` and bound buffered response reads. Treat `ErrServerClosed` as normal, propagate listener failures, and await bounded `Shutdown`. Manage hijacked connections separately. [net/http](https://pkg.go.dev/net/http), [LimitReader](https://pkg.go.dev/io#LimitReader).

## Testing

- Colocate `_test.go` files; use standard `testing`, named subtests/tables, and test-local doubles. Use same-package tests for private access.
- Assert observable success, invalid input, errors, defaults, and boundaries; cover cancellation, concurrency, and recovery where relevant. Compare error semantics unless exact diagnostics are contractual.
- Use `t.Helper`, `TempDir`, `Cleanup`, and `Setenv`. Isolate parallel tests; environment changes forbid parallel tests/ancestors. Synchronize readiness/completion with bounded waits, clean up workers/resources, report intentional skips, and fail required setup errors.
- Use `httptest` servers for clients and requests/recorders for handlers; populate direct-call path values. Check requests, responses, and failures.
- Race-test realistic concurrency; only executed paths are checked. Fuzz pure parsers with deterministic invariants, seeds, bounded runs, and saved regressions. Benchmark concrete performance questions, report relevant allocations, and use `b.Loop()` when supported, excluding setup. [Testing](https://pkg.go.dev/testing), [error assertions](https://go.dev/wiki/TestComments#test-error-semantics), [race detection](https://go.dev/doc/articles/race_detector), [fuzzing](https://go.dev/doc/security/fuzz/).

## Building the application

Provide these Make targets. Set `APP`/`MAIN`; preserve recipe tabs. Builds default to the host, accept platform overrides, and write `bin/<os>-<arch>/`:

```makefile
APP ?= app
MAIN ?= ./cmd/app
GOOS ?= $(shell go env GOOS)
GOARCH ?= $(shell go env GOARCH)
EXT := $(if $(filter windows,$(GOOS)),.exe,)
OUT := bin/$(GOOS)-$(GOARCH)/$(APP)$(EXT)

.DEFAULT_GOAL := build
.PHONY: fmt vet run build

fmt:
	go fmt ./...

vet:
	go vet ./...

run:
	go run "$(MAIN)"

build:
	mkdir -p "$(dir $(OUT))"
	GOOS="$(GOOS)" GOARCH="$(GOARCH)" go build -o "$(OUT)" "$(MAIN)"
```

```sh
make fmt vet
make run
make build                              # Host platform
make build GOOS=linux GOARCH=amd64
make build GOOS=darwin GOARCH=arm64      # macOS on Apple Silicon
make build GOOS=linux GOARCH=arm GOARM=7 # 32-bit ARMv7
```

`arm` is 32-bit; `arm64` is distinct. Check supported pairs with `go tool dist list`. GNU Make forwards overrides such as `GOARM`; cgo cross-builds need a target C toolchain. [Go targets](https://go.dev/doc/install/source#environment), [Make overrides](https://www.gnu.org/software/make/manual/html_node/Overriding.html).

Use a Go Alpine builder and Distroless Debian nonroot runtime. This BuildKit template disables cgo; cgo applications need a compatible builder/runtime pairing:

```dockerfile
# syntax=docker/dockerfile:1
ARG GO_VERSION
FROM --platform=$BUILDPLATFORM golang:${GO_VERSION}-alpine AS builder
ARG TARGETOS
ARG TARGETARCH
ARG TARGETVARIANT
ARG MAIN=./cmd/app
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS="${TARGETOS}" GOARCH="${TARGETARCH}" \
    GOARM="${TARGETVARIANT#v}" go build -o /out/app "${MAIN}"

FROM gcr.io/distroless/static-debian13:nonroot
COPY --from=builder /out/app /app
USER nonroot:nonroot
ENTRYPOINT ["/app"]
```

Replace placeholders with a supported Go image version compatible with `go.mod` and the actual main package:

```sh
docker build --platform=linux/amd64 \
  --build-arg GO_VERSION='<go-version>' \
  --build-arg MAIN='./<main-package>' -t app:local .
```

Docker supplies platform arguments; select `linux/arm64` or `linux/arm/v7` as needed. Build Darwin binaries with Make. Exclude `bin/`, VCS data, and credentials via `.dockerignore`. Keep only runtime artifacts; retain exec-form entrypoint and verify nonroot startup/shutdown. Distroless has no shell. [Multi-stage builds](https://docs.docker.com/build/building/multi-stage/), [cross-compilation](https://docs.docker.com/build/building/multi-platform/#cross-compiling-a-go-application), [Go image](https://hub.docker.com/_/golang), [Distroless](https://github.com/GoogleContainerTools/distroless).

## Verification

Run from the module root with dependencies and required fixtures available. Race tests need a supported platform, cgo, and a C compiler. `-run` still executes `TestMain`.

| Purpose          | Command                                                                                                             |
| ---------------- | ------------------------------------------------------------------------------------------------------------------- |
| Format / inspect | `go fmt ./...`; require empty `gofmt -s -l .` output (differences alone do not fail).                               |
| Vet / build      | `go vet ./...`; `go build ./...`                                                                                    |
| Dependencies     | `go mod download`; `go mod verify`; `go mod tidy` for deliberate edits.                                             |
| Tests            | `go test ./...`; add `-count=1` for fresh execution.                                                                |
| Race + coverage  | `go test -race -coverprofile=coverage.out ./...`                                                                    |
| Reports          | `go tool cover -func=coverage.out`; `go tool cover -html=coverage.out -o coverage.html` after generating a profile. |
| Fuzz             | `go test './<package>' -run='^$' -fuzz='^Fuzz<Parser>$' -fuzztime=30s`                                              |
| Benchmark        | `go test './<package>' -run='^$' -bench='^Benchmark<Operation>$' -benchmem -count=5`                                |
| Security         | `govulncheck ./...` with a compatible installed tool and vulnerability-data access.                                 |

Replace `<...>` with existing packages/targets. Downloads need network access or cached dependencies. Follow project-specific integration prerequisites. [Go commands](https://pkg.go.dev/cmd/go).

# Frontend SPA Recipe: React, TypeScript, Vite, and Nginx

## 1. Agent contract and defaults

- **MUST** follow sound repository conventions; preserve correctness, accessibility, security, and maintainability.
- **MUST** use strict TypeScript for new logic and validate untrusted data at runtime.
- **MUST** address loading, empty, error, not-found, and success states where applicable.
- **MUST** test affected behavior and run relevant checks; report checks that could not run.
- **SHOULD** start small, organize by feature, and extract abstractions only after genuine reuse.
- **SHOULD** prefer platform capabilities and a small dependency set.
- **MAY** deviate for a concrete requirement; document the reason and alternative.

| Concern            | Default                                                    | Reconsider when                                             |
| ------------------ | ---------------------------------------------------------- | ----------------------------------------------------------- |
| UI / build         | React 19 functional components / Vite 8                    | Existing framework or build constraints                     |
| Language           | TypeScript, strict mode                                    | Legacy JavaScript integration                               |
| Routing            | React Router 8, Data Mode                                  | Trivial app or framework-managed routing                    |
| Styling            | CSS Modules and CSS custom-property tokens                 | Established design system or utility CSS                    |
| Server data        | Route loaders, actions, native Fetch API                   | TanStack Query for caching, polling, optimistic updates     |
| Forms / validation | Native forms, router actions / Zod                         | React Hook Form for complex forms; existing schema pipeline |
| Testing            | Vitest, React Testing Library, Playwright                  | Existing compatible suites                                  |
| Lint / format      | ESLint / Prettier                                          | Established alternatives                                    |
| Packages / serving | npm with lockfile / multi-stage Docker, unprivileged Nginx | Existing package manager or static hosting                  |

Use maintained releases within approved majors and commit `package-lock.json`. Review major upgrades separately; verify scaffold versions and Node.js compatibility before adopting them.

## 2. Frontend, TypeScript, and React rules

- Use semantic HTML and native controls; give inputs labels and associate validation messages.
- Support keyboard use, visible `:focus-visible` styles, managed dialog/menu focus, and Escape behavior.
- Provide image text alternatives; support narrow screens, zoom, reduced motion, and adequate contrast.
- Keep layouts stable while loading. Give images dimensions and defer non-critical media.
- Treat responses, URL parameters, storage, and user input as untrusted; parse at boundaries.
- Keep API calls in feature-owned modules. Prefer same-origin `/api` URLs and propagate `AbortSignal`, including `request.signal` in loaders.
- Distinguish authorization, validation, network, and unexpected failures; never silently swallow errors.
- Enforce authentication and authorization on the server; client guards only improve user experience.
- Keep secrets out of bundles and `VITE_*` variables. Consider HttpOnly, Secure, SameSite session cookies and appropriate CSRF protection.
- Sanitize essential untrusted HTML with a maintained sanitizer. Define an application Content Security Policy at the deployment boundary.
- Prefer `const`, focused functions, guard clauses, explicit imports, and named exports unless framework conventions differ.
- Use explicit types for public boundaries, inference for obvious locals, and discriminated unions for state variants.
- Prefer `unknown` to `any`; avoid unchecked casts, non-null assertions, and suppressed errors. Explain unavoidable exceptions locally.
- Keep domain types/schemas with their feature; derive types from schemas where practical. Avoid unrelated `utils.ts` or `types.ts` collections.
- Use functional components and hooks; keep rendering pure and never mutate props, state, or shared objects unexpectedly.
- Keep state local; compute derived values during rendering. Use effects for external synchronization and handlers/actions for user operations.
- Enable development `StrictMode` and React Hooks lint rules. Use stable domain keys and component composition.
- Extract hooks for meaningful reusable behavior. Add context or state libraries only for demonstrated coordination needs.
- Measure before adding memoization, custom caches, or bundle splitting; lazy-load meaningful route boundaries.
- Preserve shareable search, filters, pagination, and tabs in the URL.
- Use CSS Modules beside components and small global stylesheets for resets, typography, and accessibility.
- Define shared colors, spacing, typography, radii, and elevation as CSS custom properties.
- Prefer Grid/Flexbox, intrinsic layouts, fluid widths, and `rem`; avoid heights that clip zoomed text.
- Respect reduced motion and supported color preferences. Reserve inline styles for dynamic values.

## 3. Repository layout

Create directories as needed; a growing application can use:

```text
src/
  app/                    # router.tsx, root-layout.tsx, route-error.tsx
  features/<feature>/
    api/                  # API operations and boundary validation
    components/           # UI and adjacent *.module.css
    routes/               # Named Component, loader, action exports
    schemas/              # Domain schemas and derived types
    *.test.tsx            # Tests near the behavior they cover
  shared/{ui,lib}/         # Reused, domain-independent code only
  styles/                 # tokens.css, global.css
  main.tsx
  vite-env.d.ts
public/                   # Assets copied without processing
tests/e2e/                # Browser journeys
nginx/default.conf
Dockerfile
.dockerignore
```

Use `kebab-case` filenames and `.tsx` for JSX. Route modules compose UI; keep substantial API/business logic in their feature. Avoid circular imports and imports into another feature's internals; extract shared contracts deliberately.

## 4. Scaffold, configuration, and scripts

```sh
npm create vite@latest my-spa -- --template react-ts
cd my-spa
npm install
npm install react-router@8 zod
```

Keep the scaffold's separate `tsconfig.app.json` and `tsconfig.node.json`. In the browser config, enable `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noFallthroughCasesInSwitch`, `noUnusedLocals`, and `noUnusedParameters`; retain bundler resolution, React JSX, and `noEmit`. Add `"paths": { "@/*": ["./src/*"] }` there if using the imports below.

`vite.config.ts` (the backend example listens on port 3000):

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/",
  resolve: { tsconfigPaths: true },
  server: {
    port: 5173,
    strictPort: true,
    proxy: { "/api": { target: "http://localhost:3000", changeOrigin: true } },
  },
  build: { outDir: "dist", sourcemap: false },
});
```

- Align Vite `base`, router `basename`, and Nginx rules for subpath deployments.
- The dev proxy disappears in production; explicitly configure a same-origin gateway or reverse proxy.
- `VITE_*` values are public and embedded at build time. Reusable images need relative API URLs or deliberate runtime configuration.
- Use `vite preview` locally; serve production assets through the chosen static host.

Suggested `package.json` scripts; install and configure the named tools, preserving working scaffold alternatives:

```json
{
  "scripts": {
    "dev": "vite",
    "typecheck": "tsc -b",
    "build": "npm run typecheck && vite build",
    "preview": "vite preview",
    "lint": "eslint . --max-warnings 0",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test"
  }
}
```

**Typechecking:** `tsc -b` traverses scaffold project references. Plain `tsc --noEmit` against a solution config with `files: []` skips its referenced application code. Use `tsc --noEmit` only for a single config that includes the source files, or explicitly check every leaf config.

## 5. Routing and loading states

Define the route tree centrally, nest shared layouts with `<Outlet />`, and navigate with `<Link>`/`<NavLink>`. Create every imported module below, including an error boundary and not-found page.

`src/app/router.tsx`:

```tsx
import { createBrowserRouter } from "react-router";
import { RootLayout } from "./root-layout";
import { RouteError } from "./route-error";

function InitialLoading() {
  return <p role="status">Loading application…</p>;
}

export const router = createBrowserRouter([
  {
    path: "/",
    Component: RootLayout,
    ErrorBoundary: RouteError,
    HydrateFallback: InitialLoading,
    children: [
      { index: true, lazy: () => import("@/features/home/routes/home.route") },
      {
        path: "projects/:projectId",
        lazy: () => import("@/features/projects/routes/project-detail.route"),
      },
      { path: "*", lazy: () => import("@/app/not-found.route") },
    ],
  },
]);
```

The initial fallback MUST be eagerly available; putting it in a lazy route leaves a blank screen while that module loads. Show progress for subsequent navigations in `src/app/root-layout.tsx`:

```tsx
import { NavLink, Outlet, useNavigation } from "react-router";

export function RootLayout() {
  const navigation = useNavigation();
  const pending = navigation.state !== "idle";
  return (
    <>
      <nav aria-label="Main navigation">
        <NavLink to="/">Home</NavLink>
      </nav>
      <p role="status">{pending ? "Loading page…" : ""}</p>
      <main id="main-content" aria-busy={pending}>
        <Outlet />
      </main>
    </>
  );
}
```

Mount `<RouterProvider router={router} />` inside `<StrictMode>` with `createRoot`; import `RouterProvider` from `react-router/dom`. Guard against a missing root element and import global/token styles in `main.tsx`.

- Lazy modules export named `Component` and optional `loader`, `action`, and `ErrorBoundary`.
- Loaders validate path parameters and API responses, pass `request.signal` to Fetch, and handle non-OK responses explicitly.
- Use native forms and router actions for mutations; show validation, submission, and result states.
- Use route error boundaries and deliberate not-found pages; plan focus and document-title behavior after navigation.
- Add TanStack Query for caching, background refresh, polling, or optimistic updates when needed. If combined with loaders, define cache/invalidation ownership and avoid duplicate independent fetching.

## 6. Docker and Nginx

Keep Node.js and application source in the build stage; copy built assets into an unprivileged Nginx runtime. Pin reviewed image tags/digests through the image update process.

`Dockerfile`:

```dockerfile
# syntax=docker/dockerfile:1
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginxinc/nginx-unprivileged:stable-alpine AS runtime
COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/ /usr/share/nginx/html/
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
```

`nginx/default.conf`:

```nginx
server {
    listen 8080;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;
    server_tokens off;
    add_header X-Content-Type-Options nosniff always;
    location = /healthz {
        access_log off;
        default_type text/plain;
        return 200 "ok\n";
    }
    location /assets/ {
        try_files $uri =404;
        add_header X-Content-Type-Options nosniff always;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }
    location = /index.html {
        add_header X-Content-Type-Options nosniff always;
        add_header Cache-Control "no-cache";
    }
    location = /api { return 404; }
    location ^~ /api/ { return 404; }
    location / { try_files $uri $uri/ /index.html; }
}
```

Location-level `add_header` directives replace inherited headers; repeat security headers wherever cache headers are set, or use a shared include. Apply this rule when adding CSP or other headers.
The API blocks intentionally return 404: configure the production gateway or replace them with an explicit reverse proxy before backend integration. Cache only content-hashed files immutably under `/assets/`; entry HTML must revalidate.

`.dockerignore`: exclude `.git`, `node_modules`, `dist`, `coverage`, `test-results`, `playwright-report`, `*.log`, `.env`, and `.env.*`; allow `!.env.example`.

## 7. Verification and delivery

Run the project's validated equivalents of:

```sh
npm ci
npm run typecheck
npm run lint
npm run format:check
npm test
npm run build
npm run test:e2e
docker build -t my-spa:local .
docker run --rm -p 8080:8080 my-spa:local
```

- Test domain calculations/validation, user-visible component interactions, and critical browser journeys with controlled data.
- Verify initial and navigation loading states, failures, keyboard/focus behavior, responsive layout, and form submission states.
- From another terminal, check `/healthz`, `/`, and a nested route such as `/projects/123`; test a direct browser reload.
- Confirm missing `/assets/...` files return 404 and inspect HTML/asset responses for the expected cache and security headers.
- Before delivery, verify feature ownership, strict typing, runtime validation, secret-free assets, and explicit production API routing.
- Report changes, dependency/deviation rationale, checks executed, and remaining integration prerequisites. Never claim unexecuted checks passed.

## References

- [React effects](https://react.dev/learn/you-might-not-need-an-effect) and [StrictMode](https://react.dev/reference/react/StrictMode)
- [TypeScript configuration](https://www.typescriptlang.org/tsconfig/) and [project references](https://www.typescriptlang.org/docs/handbook/project-references.html)
- [Vite options](https://vite.dev/config/shared-options), [environment variables](https://vite.dev/guide/env-and-mode), and [static deployment](https://vite.dev/guide/static-deploy.html)
- [React Router Data Mode](https://reactrouter.com/start/data/installation), [route objects](https://reactrouter.com/start/data/route-object), and [pending UI](https://reactrouter.com/start/data/pending-ui)
- [Docker multi-stage builds](https://docs.docker.com/build/building/multi-stage/), [Nginx headers](https://nginx.org/en/docs/http/ngx_http_headers_module.html), and [unprivileged image](https://github.com/nginx/docker-nginx-unprivileged)
