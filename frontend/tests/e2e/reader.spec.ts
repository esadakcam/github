import { test, expect, type Page } from "@playwright/test";
const owner = {
  login: "acme",
  type: "Organization",
  name: "Acme",
  bio: "Public projects",
};
const repo = {
  name: "project",
  full_name: "acme/project",
  description: "A small source repository",
  default_branch: "main",
  stargazers_count: 1200,
  language: "TypeScript",
  topics: ["tools"],
  owner,
  license: { name: "MIT License" },
};
const entry = (path: string, type: string, sha: string) => ({
  path,
  type,
  sha,
});
const commit = (sha: string) => ({
  sha,
  commit: {
    message: "Add source files",
    author: { name: "Ada", date: "2026-01-01T00:00:00Z" },
    tree: { sha: `tree-${sha}` },
  },
  parents: [{ sha: "parent" }],
  files: [{ filename: "README.md", status: "modified", patch: "+hello" }],
});
const result = {
  repositories: [repo],
  users: [],
  topics: [],
  warnings: [],
  scope: "Exact-name lookup",
};
async function mockAPI(page: Page) {
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    expect(url.search).toBe("");
    const path = decodeURIComponent(url.pathname);
    let body: unknown;
    if (path.startsWith("/api/raw/")) {
      await route.fulfill({
        body: path.endsWith("data.bin")
          ? Buffer.from([0, 255])
          : path.endsWith("code.ts")
            ? "export const answer = 42;"
            : "# Hello\n<script>window.pwned=true</script>",
        contentType: "application/octet-stream",
      });
      return;
    }
    if (path.startsWith("/api/archive/")) {
      await route.fulfill({
        body: "PKzip",
        contentType: "application/zip",
        headers: {
          "Content-Disposition": 'attachment; filename="repository.zip"',
        },
      });
      return;
    }
    if (
      path.startsWith("/api/search/users/") ||
      path.startsWith("/api/search/orgs/")
    )
      body = { ...result, repositories: [], users: [owner] };
    else if (path.startsWith("/api/search/topics/"))
      body = {
        ...result,
        repositories: [],
        topics: [{ name: "tools", stars: 1200, repositories: 1 }],
      };
    else if (path.startsWith("/api/search/") || path.startsWith("/api/topics/"))
      body = result;
    else if (
      path === "/api/github/users/acme" ||
      path === "/api/github/orgs/acme"
    )
      body = owner;
    else if (path.endsWith("/repos")) body = [repo];
    else if (path.endsWith("/branches"))
      body = [
        { name: "main", commit: { sha: "main-sha" } },
        { name: "feature/test", commit: { sha: "feature-sha" } },
      ];
    else if (path.endsWith("/tags"))
      body = [{ name: "v1", commit: { sha: "tag-sha" } }];
    else if (path.includes("/git/trees/"))
      body = {
        sha: "root",
        tree: path.endsWith("/dir-sha")
          ? [entry("code.ts", "blob", "code-sha")]
          : [
              entry("src", "tree", "dir-sha"),
              entry("README.md", "blob", "readme-sha"),
              entry("data.bin", "blob", "binary-sha"),
            ],
      };
    else if (path.endsWith("/commits")) body = [commit("main-sha")];
    else if (path.includes("/commits/"))
      body = commit(
        path.split("/").at(-1) === "main"
          ? "main-sha"
          : (path.split("/").at(-1) ?? "main-sha"),
      );
    else if (path === "/api/github/repos/acme/project") body = repo;
    else {
      await route.fulfill({ status: 404, json: { message: "Not found" } });
      return;
    }
    await route.fulfill({ json: body });
  });
}
test.beforeEach(async ({ page }) => {
  await mockAPI(page);
});

test("search, browse source, select revisions and download", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("search")).toBeVisible();
  await expect(page.getByRole("heading")).toHaveCount(0);
  await page.getByRole("searchbox").fill("acme/project");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.getByRole("link", { name: "acme/project", exact: true }).click();
  await expect(page.getByLabel("Source editor", { exact: true })).toContainText(
    "# Hello",
  );
  await expect(page.getByLabel("Source editor", { exact: true })).toContainText(
    "<script>window.pwned=true</script>",
  );
  expect(await page.evaluate(() => Object.hasOwn(window, "pwned"))).toBe(false);
  await page.getByRole("button", { name: /src/ }).click();
  await page.getByRole("button", { name: /code.ts/ }).click();
  await expect(page.getByLabel("Source editor", { exact: true })).toContainText(
    "answer = 42",
  );
  await page.reload();
  await expect(page.getByLabel("Source editor", { exact: true })).toContainText(
    "answer = 42",
  );
  await page.getByLabel("Branch or tag").selectOption("feature-sha");
  await expect(page).toHaveURL(/ref=feature-sha/);
  await expect(page.getByLabel("Branch or tag")).toHaveValue("feature-sha");
  await page.getByLabel("Branch or tag").selectOption("tag-sha");
  await expect(page).toHaveURL(/ref=tag-sha/);
  await page.getByRole("button", { name: /data.bin/ }).click();
  await expect(page.getByText("Binary file.", { exact: false })).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download ZIP" }).click();
  expect((await download).suggestedFilename()).toBe("repository.zip");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("users, organizations and topics lead to repositories", async ({
  page,
}) => {
  for (const kind of ["users", "orgs", "topics"]) {
    await page.goto("/");
    await page.getByLabel("Search type").selectOption(kind);
    await page
      .getByRole("searchbox")
      .fill(kind === "topics" ? "tools" : "acme");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await page
      .getByRole("link", {
        name: kind === "topics" ? "# tools" : "acme",
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("link", { name: "acme/project", exact: true }),
    ).toBeVisible();
  }
});

test("commit history remains available without issues or pull requests", async ({
  page,
}) => {
  await page.goto("/repo/acme/project");
  await expect(
    page.getByRole("button", { name: "Issues", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Pull requests", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Commits", exact: true }).click();
  await page.getByRole("button", { name: "Add source files" }).click();
  await expect(page.getByText("Parent parent")).toBeVisible();
  await page.getByText("README.md · modified").click();
  await expect(page.getByText("+hello")).toBeVisible();
});

test("not found and upstream errors provide recovery", async ({ page }) => {
  await page.goto("/unknown");
  await expect(
    page.getByRole("heading", { name: "Page not found" }),
  ).toBeVisible();
  await page.route("**/api/github/repos/acme/project", (route) =>
    route.fulfill({
      status: 429,
      json: { message: "GitHub returned HTTP 429" },
    }),
  );
  await page.goto("/repo/acme/project");
  await expect(page.getByRole("alert")).toHaveText("GitHub returned HTTP 429");
  await page.getByRole("link", { name: "Back to search" }).click();
  await expect(page.getByRole("searchbox")).toBeVisible();
});

test("empty repositories and failed file requests are explicit", async ({
  page,
}) => {
  await page.route("**/api/github/repos/acme/project/commits/main", (route) =>
    route.fulfill({
      status: 409,
      json: { message: "Git Repository is empty" },
    }),
  );
  await page.goto("/repo/acme/project");
  await expect(
    page.getByText("This repository has no commits yet."),
  ).toBeVisible();
  await page.unroute("**/api/github/repos/acme/project/commits/main");
  await page.route("**/api/raw/**", (route) =>
    route.fulfill({ status: 404, json: { message: "Not found" } }),
  );
  await page.goto("/repo/acme/project");
  await expect(page.getByRole("alert")).toContainText(
    "Could not load file (HTTP 404)",
  );
});

test("Monaco is read only, supports find, and loads assets from the same origin", async ({
  page,
}) => {
  const remoteRequests: string[] = [];
  const workerURLs: string[] = [];
  const errors: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (
      url.protocol.startsWith("http") &&
      url.origin !== "http://127.0.0.1:5173"
    )
      remoteRequests.push(url.href);
  });
  page.on("worker", (worker) => workerURLs.push(worker.url()));
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/repo/acme/project?file=src%2Fcode.ts");
  const source = page.getByLabel("Source editor", { exact: true });
  await expect(source).toContainText("export const answer = 42;");
  const input = page.getByRole("textbox", { name: /Read-only source code/ });
  const original = await source.locator(".view-lines").innerText();
  await input.press("Control+End");
  await input.press("x");
  await expect(source).toContainText("export const answer = 42;");
  await expect(source.locator(".view-lines")).toHaveText(original);
  await input.press("Control+f");
  const find = page.getByRole("textbox", { name: /Find/ }).first();
  await expect(find).toBeVisible();
  await find.fill("answer");
  await find.press("Escape");
  expect(
    workerURLs.every(
      (url) =>
        url.startsWith("http://127.0.0.1:5173/") ||
        url.startsWith("blob:http://127.0.0.1:5173/"),
    ),
  ).toBe(true);
  expect(remoteRequests).toEqual([]);
  expect(errors).toEqual([]);
});

test("rate limits keep the search and allow retry without losing navigation", async ({
  page,
}) => {
  let attempts = 0;
  await page.route("**/api/search/repositories/**", (route) => {
    attempts++;
    return attempts === 1
      ? route.fulfill({
          status: 403,
          json: {
            message:
              "GitHub's request limit has been reached. Please try again after it resets.",
            code: "rate_limited",
            retry_at: "2030-01-01T12:00:00Z",
          },
        })
      : route.fulfill({ json: result });
  });
  await page.goto("/search?type=repositories&q=acme%2Fproject");
  await expect(
    page.getByRole("heading", { name: "GitHub needs a moment" }),
  ).toBeVisible();
  await expect(page.getByRole("searchbox")).toHaveValue("acme/project");
  await expect(
    page.getByRole("link", { name: "GitHub Reader home" }),
  ).toBeVisible();
  await expect(
    page.getByText("Requests available again at", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "acme/project", exact: true }),
  ).toBeVisible();
  expect(attempts).toBe(2);
});

test("theme, explorer visibility, word wrap and search shortcut work together", async ({
  page,
}) => {
  await page.route("**/api/raw/**", (route) =>
    route.fulfill({
      body: `export const message = "${"read only editor ".repeat(30)}";`,
      contentType: "application/octet-stream",
    }),
  );
  await page.goto("/repo/acme/project?file=src%2Fcode.ts");
  const source = page.getByLabel("Source editor", { exact: true });
  await expect(source).toContainText("export const message");
  const lines = source.locator(".view-lines .view-line");
  await expect(lines).toHaveCount(1);
  await page.getByRole("button", { name: "Toggle word wrap" }).click();
  await expect.poll(() => lines.count()).toBeGreaterThan(1);
  await page.getByRole("button", { name: "Hide files" }).click();
  await expect(page.getByLabel("Repository files")).toBeHidden();
  await page.getByRole("button", { name: "Show files" }).click();
  await expect(page.getByLabel("Repository files")).toBeVisible();
  await page.getByRole("button", { name: "Switch to dark theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(source.locator(".monaco-editor-background").first()).toHaveCSS(
    "background-color",
    "rgb(21, 23, 27)",
  );
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(source).toContainText("export const message");
  await page.keyboard.press("Control+k");
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("searchbox")).toBeFocused();
});

test("sorting account repositories does not repeat the upstream list request", async ({
  page,
}) => {
  let lists = 0;
  await page.route("**/api/github/orgs/acme/repos", (route) => {
    lists++;
    return route.fulfill({
      json: [
        {
          ...repo,
          name: "zebra",
          full_name: "acme/zebra",
          stargazers_count: 200,
        },
        {
          ...repo,
          name: "alpha",
          full_name: "acme/alpha",
          stargazers_count: 10,
        },
      ],
    });
  });
  await page.goto("/search?user=acme");
  const cards = page.locator("main li").getByRole("link", { name: /^acme\// });
  await expect(cards.first()).toHaveText("acme/zebra");
  await page.getByLabel("Sort repositories").selectOption("name");
  await expect(cards.first()).toHaveText("acme/alpha");
  expect(lists).toBe(1);
});
