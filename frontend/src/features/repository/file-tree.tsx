import { useCallback, useState, type CSSProperties } from "react";
import {
  request,
  segment,
  treeSchema,
  type Tree,
  type Entry,
} from "../../shared/api";
import { useResource } from "../../shared/use-resource";
import { Icon } from "../../shared/icon";
import styles from "./repository.module.css";

type Props = {
  base: string;
  selected: string;
  onSelect: (path: string) => void;
};
type Indentation = CSSProperties & { "--tree-depth": number };

function FileIcon({ name }: { name: string }) {
  const extension = name.split(".").at(-1)?.toLowerCase();
  const kind =
    extension === "ts" || extension === "tsx"
      ? "typescript"
      : extension === "js" || extension === "jsx"
        ? "javascript"
        : extension === "go"
          ? "go"
          : extension === "py"
            ? "python"
            : extension === "md"
              ? "markdown"
              : extension === "json" ||
                  extension === "yaml" ||
                  extension === "yml" ||
                  extension === "toml"
                ? "config"
                : extension === "svg" ||
                    extension === "png" ||
                    extension === "jpg" ||
                    extension === "gif"
                  ? "image"
                  : "file";
  const icon =
    kind === "markdown"
      ? "markdown"
      : kind === "image"
        ? "image"
        : kind === "config"
          ? "settings"
          : kind === "file"
            ? "file"
            : "code";
  return (
    <span className={styles.fileIcon} data-kind={kind}>
      <Icon name={icon} />
    </span>
  );
}

function Directory({
  base,
  sha,
  path,
  depth,
  ...props
}: Props & { sha: string; path: string; depth: number }) {
  const load = useCallback(
    (signal: AbortSignal) =>
      request(`${base}/git/trees/${segment(sha)}`, treeSchema, signal),
    [base, sha],
  );
  const state = useResource(load);
  if (state.status === "loading")
    return (
      <p className={styles.treeMessage} role="status">
        Loading directory…
      </p>
    );
  if (state.status === "error")
    return (
      <p className={styles.treeMessage} role="alert">
        {state.message}
      </p>
    );
  return (
    <Entries
      tree={state.data}
      base={base}
      prefix={path}
      depth={depth}
      {...props}
    />
  );
}
function TreeEntry({
  entry,
  prefix,
  depth,
  ...props
}: Props & { entry: Entry; prefix: string; depth: number }) {
  const path = prefix ? `${prefix}/${entry.path}` : entry.path;
  const [open, setOpen] = useState(props.selected.startsWith(`${path}/`));
  const indentation: Indentation = { "--tree-depth": depth };
  if (entry.type === "tree")
    return (
      <li>
        <button
          className={styles.treeButton}
          style={indentation}
          title={path}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          <Icon
            name="chevron"
            className={`${styles.chevron} ${open ? styles.chevronOpen : ""}`}
          />
          <Icon
            name={open ? "folder-open" : "folder"}
            className={styles.folderIcon}
          />
          <span className={styles.treeName}>{entry.path}</span>
        </button>
        {open && (
          <Directory path={path} sha={entry.sha} depth={depth + 1} {...props} />
        )}
      </li>
    );
  if (entry.type === "commit")
    return (
      <li>
        <span
          className={`${styles.treeButton} ${styles.submodule}`}
          style={indentation}
          title={`${path} (submodule)`}
        >
          <span />
          <Icon name="repository" />
          <span className={styles.treeName}>{entry.path}</span>
          <span className={styles.treeBadge}>submodule</span>
        </span>
      </li>
    );
  return (
    <li>
      <button
        className={styles.treeButton}
        style={indentation}
        title={path}
        aria-current={props.selected === path ? "true" : undefined}
        onClick={() => props.onSelect(path)}
      >
        <span />
        <FileIcon name={entry.path} />
        <span className={styles.treeName}>{entry.path}</span>
        {entry.mode === "120000" && (
          <span className={styles.treeBadge} aria-label="Symbolic link">
            ↗
          </span>
        )}
      </button>
    </li>
  );
}
function Entries({
  tree,
  prefix = "",
  depth = 0,
  ...props
}: Props & { tree: Tree; prefix?: string; depth?: number }) {
  const entries = [...tree.tree].sort(
    (a, b) =>
      Number(b.type === "tree") - Number(a.type === "tree") ||
      a.path.localeCompare(b.path),
  );
  const indentation: Indentation = { "--tree-depth": depth };
  return (
    <>
      {tree.truncated && (
        <p className={styles.treeMessage}>
          GitHub truncated this directory listing.
        </p>
      )}
      <ul
        className={`${styles.tree} ${depth > 0 ? styles.subtree : ""}`}
        style={indentation}
      >
        {entries.map((entry) => (
          <TreeEntry
            key={entry.path}
            entry={entry}
            prefix={prefix}
            depth={depth}
            {...props}
          />
        ))}
      </ul>
      {entries.length === 0 && (
        <p className={styles.treeMessage}>Empty directory.</p>
      )}
    </>
  );
}
export function FileTree(props: Props & { tree: Tree }) {
  return <Entries {...props} />;
}
