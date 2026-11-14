import { requestErrorSchema } from "./api";
import { useEffect, useState } from "react";

type State<T> =
  | { status: "loading" }
  | { status: "success"; data: T }
  | { status: "error"; message: string };

// Keyed components remount on navigation. Abort prevents stale requests from updating state.
export function useResource<T>(
  load: (signal: AbortSignal) => Promise<T>,
): State<T> {
  const [state, setState] = useState<State<T>>({ status: "loading" });
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) setState({ status: "success", data });
      },
      async (error: unknown) => {
        let message =
          error instanceof Error
            ? error.message
            : "Could not load this resource.";
        if (error instanceof Response) {
          const text = await error
            .text()
            .catch(() => `Request failed (HTTP ${error.status}).`);
          try {
            const parsed = requestErrorSchema.safeParse(JSON.parse(text));
            message = parsed.success ? parsed.data.message : text;
          } catch {
            message = text;
          }
        }
        if (!controller.signal.aborted)
          setState({
            status: "error",
            message,
          });
      },
    );
    return () => controller.abort();
  }, [load]);
  return state;
}
