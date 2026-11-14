import { createBrowserRouter } from "react-router";
import { RootLayout } from "./root-layout";
import { RouteError } from "./route-error";
function InitialLoading() {
  return (
    <p className="error-page" role="status">
      Loading application…
    </p>
  );
}
export const router = createBrowserRouter([
  {
    path: "/",
    Component: RootLayout,
    ErrorBoundary: RouteError,
    HydrateFallback: InitialLoading,
    children: [
      {
        index: true,
        ErrorBoundary: RouteError,
        lazy: () => import("../features/search/home.route"),
      },
      {
        path: "search",
        ErrorBoundary: RouteError,
        lazy: () => import("../features/search/results.route"),
      },
      {
        path: "repo/:owner/:repo",
        ErrorBoundary: RouteError,
        lazy: () => import("../features/repository/repository.route"),
      },
      { path: "*", lazy: () => import("./not-found.route") },
    ],
  },
]);
