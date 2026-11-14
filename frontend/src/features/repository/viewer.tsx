import { lazy, Suspense, useCallback, useState } from "react";
import { readFile, segment } from "../../shared/api";
import { useResource } from "../../shared/use-resource";
import { Icon } from "../../shared/icon";
import styles from "./repository.module.css";
const CodeEditor = lazy(() =>
  import("./code-editor").then((module) => ({ default: module.CodeEditor })),
);
export function Viewer({
  owner,
  repo,
  sha,
  path,
}: {
  owner: string;
  repo: string;
  sha: string;
  path: string;
}) {
  const url = `/api/raw/${segment(owner)}/${segment(repo)}/${segment(sha)}/${path.split("/").map(segment).join("/")}`;
  const load = useCallback(
    (signal: AbortSignal) => readFile(url, signal),
    [url],
  );
  const state = useResource(load);
  const [wrap, setWrap] = useState(false);
  const filename = path.split("/").at(-1) ?? path;
  return (
    <>
      <div className={styles.fileHeader}>
        <div className={styles.fileTab}>
          <Icon name="file" />
          <strong>{filename}</strong>
        </div>
        <div className={styles.fileActions}>
          {state.status === "success" && !state.data.binary && (
            <button
              className="icon-button"
              title="Toggle word wrap"
              aria-label="Toggle word wrap"
              aria-pressed={wrap}
              onClick={() => setWrap(!wrap)}
            >
              <Icon name="wrap" />
            </button>
          )}
          <a
            className="icon-button"
            href={url}
            download={filename}
            title="Download file"
            aria-label="Download file"
          >
            <Icon name="download" />
          </a>
        </div>
      </div>
      <div className={styles.breadcrumbs} title={path}>
        {repo} / {path.split("/").join(" / ")}
      </div>
      {state.status === "loading" && (
        <p className={styles.empty} role="status">
          Loading file…
        </p>
      )}
      {state.status === "error" && (
        <p className={styles.empty} role="alert">
          {state.message}
        </p>
      )}
      {state.status === "success" &&
        (state.data.binary ? (
          <p className={styles.empty}>
            Binary file. Download it to view its contents.
          </p>
        ) : (
          <Source text={state.data.text} path={path} wrap={wrap} />
        ))}
    </>
  );
}
function Source({
  text,
  path,
  wrap,
}: {
  text: string;
  path: string;
  wrap: boolean;
}) {
  const preview = text.slice(0, 1_000_000).split("\n", 10_001);
  const lines = preview.slice(0, 10_000);
  const truncated = text.length > 1_000_000 || preview.length > 10_000;
  return (
    <>
      {text === "" && <p className={styles.empty}>Empty file.</p>}
      {truncated && (
        <p className="notice">
          Preview limited to 1 million characters or 10,000 lines. Download the
          complete file.
        </p>
      )}
      <Suspense
        fallback={
          <p role="status" className={styles.empty}>
            Loading editor…
          </p>
        }
      >
        <CodeEditor value={lines.join("\n")} path={path} wrap={wrap} />
      </Suspense>
      <div className={styles.fileStatus}>
        <span>
          {lines.length.toLocaleString()}{" "}
          {lines.length === 1 ? "line" : "lines"}
          <span>UTF-8</span>
        </span>
        <span>
          <Icon name="lock" />
          Read only
        </span>
      </div>
    </>
  );
}
