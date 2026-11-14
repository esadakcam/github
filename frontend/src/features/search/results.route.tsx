import { z } from "zod";
import {
  Link,
  useLoaderData,
  useSearchParams,
  type LoaderFunctionArgs,
  type ShouldRevalidateFunctionArgs,
} from "react-router";
import {
  request,
  repositorySchema,
  searchSchema,
  segment,
  userSchema,
  type Repository,
} from "../../shared/api";
import { Icon } from "../../shared/icon";
import { SearchForm } from "./search-form";
import styles from "./search.module.css";

const kinds = ["repositories", "users", "orgs", "topics"] as const;
export async function loader({ request: routeRequest }: LoaderFunctionArgs) {
  const params = new URL(routeRequest.url).searchParams;
  const query = (params.get("q") ?? "").trim();
  const kind = z.enum(kinds).catch("repositories").parse(params.get("type"));
  const topic = params.get("topic");
  const user = params.get("user");
  if (topic) {
    const result = await request(
      `/api/topics/${segment(topic)}`,
      searchSchema,
      routeRequest.signal,
    );
    return {
      result,
      query: topic,
      kind: "repositories",
      heading: `Topic: ${topic}`,
      profile: null,
    };
  }
  if (user) {
    const profile = await request(
      `/api/github/users/${segment(user)}`,
      userSchema,
      routeRequest.signal,
    );
    const prefix = profile.type === "Organization" ? "orgs" : "users";
    const repos = await request(
      `/api/github/${prefix}/${segment(user)}/repos`,
      z.array(repositorySchema),
      routeRequest.signal,
    );
    repos.sort(
      (a, b) =>
        b.stargazers_count - a.stargazers_count ||
        a.full_name.localeCompare(b.full_name),
    );
    return {
      result: {
        repositories: repos,
        users: [],
        topics: [],
        warnings: [],
        scope: "First page of account repositories, ordered by stars",
      },
      query: user,
      kind: "repositories",
      heading: `${profile.name ?? profile.login} / repositories`,
      profile,
    };
  }
  if (!query) throw new Response("Enter a search term.", { status: 400 });
  const result = await request(
    `/api/search/${kind}/${segment(query)}`,
    searchSchema,
    routeRequest.signal,
  );
  return {
    result,
    query,
    kind,
    heading: `Results for “${query}”`,
    profile: null,
  };
}

export function shouldRevalidate({
  currentUrl,
  nextUrl,
  defaultShouldRevalidate,
}: ShouldRevalidateFunctionArgs) {
  const sameSearch = ["q", "type", "topic", "user"].every(
    (key) => currentUrl.searchParams.get(key) === nextUrl.searchParams.get(key),
  );
  if (sameSearch && currentUrl.search !== nextUrl.search) return false;
  return defaultShouldRevalidate;
}
export function RepositoryCard({ repo }: { repo: Repository }) {
  return (
    <li className={styles.card}>
      <span className={styles.cardIcon}>
        <Icon name="repository" />
      </span>
      <div>
        <div className={styles.cardTop}>
          <Link
            className={styles.name}
            to={`/repo/${segment(repo.owner.login)}/${segment(repo.name)}`}
          >
            <span className={styles.nameOwner}>{repo.owner.login}/</span>
            {repo.name}
          </Link>
          <span className={styles.starCount}>
            <Icon name="star" />
            {repo.stargazers_count.toLocaleString()}
          </span>
        </div>
        {repo.description && <p>{repo.description}</p>}
        <div className={styles.metadata}>
          {repo.language && (
            <span>
              <i className={styles.languageDot} />
              {repo.language}
            </span>
          )}
          <span>
            <Icon name="lock" />
            Read only
          </span>
        </div>
        <div className={styles.topics}>
          {repo.topics.map((topic) => (
            <Link key={topic} to={`/search?topic=${segment(topic)}`}>
              {topic}
            </Link>
          ))}
        </div>
      </div>
    </li>
  );
}
export function Component() {
  const { result, query, kind, heading, profile } =
    useLoaderData<typeof loader>();
  const [params, setParams] = useSearchParams();
  const sort = params.get("sort") === "name" ? "name" : "stars";
  const repos = [...result.repositories].sort((a, b) =>
    sort === "name"
      ? a.full_name.localeCompare(b.full_name)
      : b.stargazers_count - a.stargazers_count ||
        a.full_name.localeCompare(b.full_name),
  );
  const count = repos.length + result.users.length + result.topics.length;
  const types = [
    { value: "repositories", label: "Repositories", icon: "repository" },
    { value: "users", label: "Users", icon: "users" },
    { value: "orgs", label: "Organizations", icon: "organization" },
    { value: "topics", label: "Topics", icon: "tag" },
  ] as const;
  return (
    <div className={styles.results}>
      <SearchForm key={`${kind}:${query}`} query={query} kind={kind} />
      <header className={styles.resultsHeader}>
        <div>
          <div className={styles.eyebrow}>
            <Icon
              name={profile ? "users" : params.has("topic") ? "tag" : "search"}
            />
            {profile
              ? "Account"
              : params.has("topic")
                ? "Topic"
                : "Search results"}
          </div>
          <h1>{heading}</h1>
          {profile?.bio && <p>{profile.bio}</p>}
        </div>
        <span className="muted">
          {count} {count === 1 ? "result" : "results"}
        </span>
      </header>
      <div className={styles.resultsToolbar}>
        <nav className={styles.typeTabs} aria-label="Search categories">
          {types.map((type) => (
            <Link
              key={type.value}
              to={`/search?type=${type.value}&q=${segment(query)}`}
              aria-current={kind === type.value ? "page" : undefined}
            >
              <Icon name={type.icon} />
              {type.label}
            </Link>
          ))}
        </nav>
        {repos.length > 1 && (
          <>
            <label className="sr-only" htmlFor="result-sort">
              Sort repositories
            </label>
            <select
              className={styles.sort}
              id="result-sort"
              value={sort}
              onChange={(event) => {
                const next = new URLSearchParams(params);
                next.set("sort", event.target.value);
                setParams(next);
              }}
            >
              <option value="stars">Most stars</option>
              <option value="name">Name A–Z</option>
            </select>
          </>
        )}
      </div>
      {result.warnings.map((warning, i) => (
        <p role="alert" className="notice" key={i}>
          {warning}
        </p>
      ))}
      {count === 0 && (
        <div className={styles.empty}>
          <Icon name="search" />
          <h2>No matches found</h2>
          <p>Try an exact account name, topic, or owner/repo.</p>
        </div>
      )}
      <ul className={styles.list}>
        {repos.map((repo) => (
          <RepositoryCard key={repo.full_name} repo={repo} />
        ))}
        {result.users.map((user) => (
          <li key={user.login} className={styles.card}>
            <span className={`${styles.cardIcon} ${styles.avatar}`}>
              {user.login.slice(0, 1)}
            </span>
            <div>
              <div className={styles.cardTop}>
                <Link
                  className={styles.name}
                  to={`/search?user=${segment(user.login)}`}
                >
                  {user.login}
                </Link>
                <span className={styles.starCount}>{user.type}</span>
              </div>
              <p>
                {user.name ?? `Explore ${user.login}’s public repositories.`}
              </p>
              <Link
                className={styles.cardAction}
                to={`/search?user=${segment(user.login)}`}
              >
                View repositories
                <Icon name="arrow" />
              </Link>
            </div>
          </li>
        ))}
        {result.topics.map((topic) => (
          <li key={topic.name} className={styles.card}>
            <span className={styles.cardIcon}>
              <Icon name="tag" />
            </span>
            <div>
              <div className={styles.cardTop}>
                <Link
                  className={styles.name}
                  to={`/search?topic=${segment(topic.name)}`}
                >
                  # {topic.name}
                </Link>
                <span className={styles.starCount}>
                  <Icon name="star" />
                  {topic.stars.toLocaleString()}
                </span>
              </div>
              <p>{topic.repositories} repositories on this topic page</p>
              <Link
                className={styles.cardAction}
                to={`/search?topic=${segment(topic.name)}`}
              >
                Explore topic
                <Icon name="arrow" />
              </Link>
            </div>
          </li>
        ))}
      </ul>
      <p className={styles.scope}>{result.scope}</p>
    </div>
  );
}
