import { useState } from "react";
import { z } from "zod";
import {
  useLoaderData,
  useSearchParams,
  type LoaderFunctionArgs,
  type ShouldRevalidateFunctionArgs,
} from "react-router";
import {
  request,
  repoAPI,
  repositorySchema,
  refsSchema,
  commitSchema,
  treeSchema,
  segment,
} from "../../shared/api";
import { Header } from "./header";
import { FileTree } from "./file-tree";
import { Icon } from "../../shared/icon";
import { Viewer } from "./viewer";
import { CommitHistory } from "./commit-history";
import styles from "./repository.module.css";

const resolvedCommitSchema = commitSchema.extend({
  commit: commitSchema.shape.commit.extend({
    tree: z.object({ sha: z.string() }),
  }),
});
export async function loader({
  params,
  request: routeRequest,
}: LoaderFunctionArgs) {
  const owner = z.string().min(1).parse(params.owner);
  const name = z.string().min(1).parse(params.repo);
  const base = repoAPI(owner, name);
  const signal = routeRequest.signal;
  const repo = await request(base, repositorySchema, signal);
  const ref =
    new URL(routeRequest.url).searchParams.get("ref") ?? repo.default_branch;
  const warnings: string[] = [];
  const references = await Promise.allSettled([
    request(`${base}/branches`, refsSchema, signal),
    request(`${base}/tags`, refsSchema, signal),
  ]);
  const branches =
    references[0].status === "fulfilled" ? references[0].value : [];
  const tags = references[1].status === "fulfilled" ? references[1].value : [];
  references.forEach((result, i) => {
    if (result.status === "rejected")
      warnings.push(`Could not load ${i === 0 ? "branches" : "tags"}.`);
  });
  let commit;
  try {
    commit = await request(
      `${base}/commits/${segment(ref)}`,
      resolvedCommitSchema,
      signal,
    );
  } catch (error) {
    if (error instanceof Response && error.status === 409)
      return {
        repo,
        base,
        branches,
        tags,
        ref,
        commit: null,
        tree: null,
        warnings,
      };
    throw error;
  }
  const tree = await request(
    `${base}/git/trees/${segment(commit.commit.tree.sha)}`,
    treeSchema,
    signal,
  );
  return { repo, base, branches, tags, ref, commit, tree, warnings };
}
export function shouldRevalidate({
  currentUrl,
  nextUrl,
  currentParams,
  nextParams,
  defaultShouldRevalidate,
}: ShouldRevalidateFunctionArgs) {
  const sameRevision =
    currentParams.owner === nextParams.owner &&
    currentParams.repo === nextParams.repo &&
    currentUrl.searchParams.get("ref") === nextUrl.searchParams.get("ref");
  if (sameRevision && currentUrl.search !== nextUrl.search) return false;
  return defaultShouldRevalidate;
}
export function Component() {
  const data = useLoaderData<typeof loader>();
  const [params, setParams] = useSearchParams();
  const [explorerOpen, setExplorerOpen] = useState(true);
  const view = z
    .enum(["code", "commits"])
    .catch("code")
    .parse(params.get("view"));
  const file =
    params.get("file") ??
    data.tree?.tree.find(
      (entry) => entry.type === "blob" && /^readme(\.|$)/i.test(entry.path),
    )?.path ??
    "";
  const selectFile = (path: string) => {
    const next = new URLSearchParams(params);
    next.set("file", path);
    next.set("view", "code");
    setParams(next);
  };
  const selectRef = (ref: string) => {
    const next = new URLSearchParams(params);
    next.set("ref", ref);
    next.delete("file");
    next.delete("item");
    setParams(next);
  };
  return (
    <div className={styles.repository}>
      <Header repo={data.repo} />
      <nav aria-label="Repository views" className={styles.tabs}>
        {view === "code" && (
          <button
            className={styles.explorerToggle}
            aria-label={explorerOpen ? "Hide files" : "Show files"}
            aria-expanded={explorerOpen}
            aria-controls="repository-files"
            onClick={() => setExplorerOpen(!explorerOpen)}
          >
            <Icon name="panel" />
          </button>
        )}
        {(["code", "commits"] as const).map((tab) => (
          <button
            key={tab}
            aria-current={view === tab ? "page" : undefined}
            onClick={() => {
              const next = new URLSearchParams(params);
              next.set("view", tab);
              next.delete("item");
              setParams(next);
            }}
          >
            <Icon name={tab === "code" ? "logo" : "clock"} />
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </nav>
      {data.warnings.map((warning) => (
        <p className="notice" role="alert" key={warning}>
          {warning}
        </p>
      ))}
      {view === "code" &&
        (!data.commit || !data.tree ? (
          <p className={styles.empty}>This repository has no commits yet.</p>
        ) : (
          <div
            className={styles.workspace}
            data-explorer={explorerOpen ? "open" : "hidden"}
          >
            <aside
              className={styles.sidebar}
              id="repository-files"
              aria-label="Repository files"
              hidden={!explorerOpen}
            >
              <div className={styles.explorerHeading}>
                <span>Explorer</span>
                <a
                  className={styles.explorerAction}
                  aria-label="Download ZIP"
                  title="Download repository as ZIP"
                  href={`/api/archive/${segment(data.repo.owner.login)}/${segment(data.repo.name)}/${segment(data.commit.sha)}`}
                >
                  <Icon name="download" />
                </a>
              </div>
              <div className={styles.revisionControl}>
                <Icon name="branch" />
                <label className="sr-only" htmlFor="revision">
                  Branch or tag
                </label>
                <select
                  id="revision"
                  value={data.commit.sha}
                  onChange={(event) => selectRef(event.target.value)}
                >
                  {![...data.branches, ...data.tags].some(
                    (ref) => ref.commit.sha === data.commit?.sha,
                  ) && <option value={data.commit.sha}>{data.ref}</option>}
                  <optgroup label="Branches">
                    {data.branches.map((ref) => (
                      <option key={ref.name} value={ref.commit.sha}>
                        {ref.name}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Tags">
                    {data.tags.map((ref) => (
                      <option key={ref.name} value={ref.commit.sha}>
                        {ref.name}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </div>
              <div className={styles.explorerRoot} title={data.repo.full_name}>
                <Icon name="repository" />
                <span>{data.repo.name}</span>
              </div>
              <div className={styles.explorerFiles}>
                <FileTree
                  key={data.commit.sha}
                  tree={data.tree}
                  base={data.base}
                  selected={file}
                  onSelect={selectFile}
                />
              </div>
              <p className={styles.treeNote}>
                First page of branches and tags.
              </p>
            </aside>
            <section className={styles.viewer} aria-label="File viewer">
              {file ? (
                <Viewer
                  key={`${data.commit.sha}:${file}`}
                  owner={data.repo.owner.login}
                  repo={data.repo.name}
                  sha={data.commit.sha}
                  path={file}
                />
              ) : (
                <p className={styles.empty}>
                  Select a file to read its source.
                </p>
              )}
            </section>
          </div>
        ))}
      {view !== "code" && (
        <CommitHistory
          key={`${data.base}:${view}:${params.get("item") ?? ""}`}
          base={data.base}
          item={params.get("item")}
        />
      )}
    </div>
  );
}
