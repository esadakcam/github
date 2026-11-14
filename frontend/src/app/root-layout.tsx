import { useEffect, useRef } from "react";
import {
  Link,
  Outlet,
  useLocation,
  useNavigation,
  useNavigate,
} from "react-router";
import { Icon } from "../shared/icon";
import { ThemeToggle } from "../shared/theme";
export function RootLayout() {
  const navigation = useNavigation();
  const location = useLocation();
  const navigate = useNavigate();
  const main = useRef<HTMLElement>(null);
  const home = location.pathname === "/";
  const pending = navigation.state !== "idle";
  useEffect(() => {
    document.title = home
      ? "GitHub Reader"
      : `${location.pathname.startsWith("/repo/") ? "Repository" : "Search"} · GitHub Reader`;
    if (!home) main.current?.focus();
  }, [home, location.pathname]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (home) document.getElementById("search-query")?.focus();
        else void navigate("/");
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [home, navigate]);
  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      {home ? (
        <div className="home-tools">
          <ThemeToggle />
        </div>
      ) : (
        <header className="app-header">
          <Link className="brand" to="/" aria-label="GitHub Reader home">
            <span className="brand-mark">
              <Icon name="logo" />
            </span>
            GitHub Reader
          </Link>
          <Link className="header-search" to="/" aria-label="Open search">
            <Icon name="search" />
            <span>Search repositories, people, topics…</span>
            <kbd>Ctrl K</kbd>
          </Link>
          <div className="header-actions">
            <span className="readonly-badge">
              <Icon name="lock" />
              Read only
            </span>
            <ThemeToggle />
          </div>
        </header>
      )}
      {pending && <div className="navigation-progress" />}
      <p className="navigation-status" role="status">
        {pending ? "Loading page…" : ""}
      </p>
      <main id="main-content" ref={main} tabIndex={-1} aria-busy={pending}>
        <Outlet />
      </main>
    </>
  );
}
