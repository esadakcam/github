import {
  Link,
  isRouteErrorResponse,
  useRouteError,
  useLocation,
  useRevalidator,
} from "react-router";
import { Icon } from "../shared/icon";
import { requestErrorSchema } from "../shared/api";
import { SearchForm } from "../features/search/search-form";
export function RouteError() {
  const error: unknown = useRouteError();
  const location = useLocation();
  const revalidator = useRevalidator();
  const params = new URLSearchParams(location.search);
  let message =
    error instanceof Error ? error.message : "An unexpected error occurred.";
  let status = 500;
  let code = "";
  let retryAt: string | undefined;
  if (isRouteErrorResponse(error)) {
    status = error.status;
    const parsed = requestErrorSchema.safeParse(error.data);
    if (parsed.success) {
      message = parsed.data.message;
      code = parsed.data.code ?? "";
      retryAt = parsed.data.retry_at;
    } else if (typeof error.data === "string") message = error.data;
  }
  const limited = code === "rate_limited";
  const heading = limited
    ? "GitHub needs a moment"
    : status === 404
      ? "We couldn’t find that"
      : status === 403
        ? "Access is restricted"
        : status === 429
          ? "Too many requests"
          : "Something interrupted the request";
  return (
    <div className="error-page">
      {location.pathname === "/search" && (
        <SearchForm
          key={location.search}
          query={params.get("q") ?? ""}
          kind={params.get("type") ?? "repositories"}
        />
      )}
      <div className="error-card">
        <div className="error-symbol">
          <Icon name={limited ? "clock" : status === 403 ? "lock" : "search"} />
        </div>
        <h1>{heading}</h1>
        <p role="alert">{message}</p>
        {retryAt && (
          <p className="error-detail">
            Requests available again at{" "}
            <time dateTime={retryAt}>
              {new Date(retryAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
                timeZoneName: "short",
              })}
            </time>
            .
          </p>
        )}
        <p>
          {limited
            ? "Wait for the limit to reset before trying again."
            : status === 404
              ? "Check the spelling and use an exact account name, topic, or owner/repo."
              : "Your current page is saved. You can retry the request or return to search."}
        </p>
        <div className="error-actions">
          <button
            className="button button-primary"
            onClick={() => void revalidator.revalidate()}
            disabled={revalidator.state === "loading"}
          >
            {revalidator.state === "loading" ? "Trying again…" : "Try again"}
          </button>
          <Link className="button" to="/">
            Back to search
          </Link>
        </div>
      </div>
    </div>
  );
}
