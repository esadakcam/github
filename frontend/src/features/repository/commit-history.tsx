import { useCallback } from "react";
import { z } from "zod";
import { useSearchParams } from "react-router";
import { request, commitSchema, segment } from "../../shared/api";
import { useResource } from "../../shared/use-resource";
import styles from "./repository.module.css";

function useOpenItem() {
  const [params, setParams] = useSearchParams();
  return (item: string | null) => {
    const next = new URLSearchParams(params);
    if (item) next.set("item", item);
    else next.delete("item");
    setParams(next);
  };
}
export function CommitHistory({
  base,
  item,
}: {
  base: string;
  item: string | null;
}) {
  const load = useCallback(
    (signal: AbortSignal) =>
      item
        ? request(
            `${base}/commits/${segment(item)}`,
            commitSchema,
            signal,
          ).then((commit) => [commit])
        : request(`${base}/commits`, z.array(commitSchema), signal),
    [base, item],
  );
  const state = useResource(load);
  const open = useOpenItem();
  return (
    <section className={styles.activity}>
      <h2>Commit history</h2>
      <p className="muted">
        Default branch · GitHub default page. Open a commit to follow its
        parents.
      </p>
      {item && <button onClick={() => open(null)}>Back to history</button>}
      {state.status === "loading" && <p role="status">Loading commits…</p>}
      {state.status === "error" && <p role="alert">{state.message}</p>}
      {state.status === "success" &&
        (state.data.length === 0 ? (
          <p>No commits.</p>
        ) : (
          state.data.map((commit) => (
            <article key={commit.sha} className={styles.activityItem}>
              <button
                className={styles.textButton}
                onClick={() => open(commit.sha)}
              >
                {commit.commit.message.split("\n")[0]}
              </button>
              <p className="muted">
                {commit.sha.slice(0, 7)} · {commit.commit.author?.name} ·{" "}
                {commit.commit.author?.date.slice(0, 10)}
              </p>
              {item && (
                <>
                  <pre className={styles.body}>{commit.commit.message}</pre>
                  {commit.parents.map((parent) => (
                    <button key={parent.sha} onClick={() => open(parent.sha)}>
                      Parent {parent.sha.slice(0, 7)}
                    </button>
                  ))}
                  {commit.files?.map((file) => (
                    <details key={file.filename}>
                      <summary>
                        {file.filename} · {file.status}
                      </summary>
                      <pre className={styles.patch}>
                        {file.patch ?? "No text diff available."}
                      </pre>
                    </details>
                  ))}
                </>
              )}
            </article>
          ))
        ))}
    </section>
  );
}
