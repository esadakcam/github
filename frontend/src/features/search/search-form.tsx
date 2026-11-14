import { Form, useNavigation } from "react-router";
import { Icon } from "../../shared/icon";
import styles from "./search.module.css";
export function SearchForm({
  query = "",
  kind = "repositories",
  autoFocus = false,
}: {
  query?: string;
  kind?: string;
  autoFocus?: boolean;
}) {
  const pending = useNavigation().state !== "idle";
  return (
    <Form action="/search" className={styles.form} role="search">
      <div className={styles.searchField}>
        <Icon name="search" />
        <label className="sr-only" htmlFor="search-query">
          Search GitHub
        </label>
        <input
          id="search-query"
          name="q"
          type="search"
          defaultValue={query}
          placeholder="Search an account, topic, or owner/repo…"
          required
          maxLength={256}
          autoFocus={autoFocus}
        />
      </div>
      <label className="sr-only" htmlFor="search-kind">
        Search type
      </label>
      <select id="search-kind" name="type" defaultValue={kind}>
        <option value="repositories">Repositories</option>
        <option value="users">Users</option>
        <option value="orgs">Organizations</option>
        <option value="topics">Topics</option>
      </select>
      <button type="submit" aria-label="Search" disabled={pending}>
        <span>{pending ? "Searching" : "Search"}</span>
        <Icon name="arrow" />
      </button>
    </Form>
  );
}
