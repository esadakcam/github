import { Link } from "react-router";
import { segment, type Repository } from "../../shared/api";
import { Icon } from "../../shared/icon";
import styles from "./repository.module.css";
export function Header({ repo }: { repo: Repository }) {
  return (
    <header className={styles.header}>
      <div className={styles.repoIdentity}>
        <span className={styles.repoMark}>
          <Icon name="repository" />
        </span>
        <div>
          <h1>
            <Link to={`/search?user=${segment(repo.owner.login)}`}>
              {repo.owner.login}
            </Link>
            <span className={styles.repoSlash}>/</span>
            <span>{repo.name}</span>
          </h1>
          {repo.description && <p>{repo.description}</p>}
        </div>
      </div>
      <div className={styles.metadata}>
        <span>
          <Icon name="star" />
          {repo.stargazers_count.toLocaleString()}
        </span>
        {repo.language && (
          <span>
            <i className={styles.languageDot} />
            {repo.language}
          </span>
        )}
        {repo.license && (
          <span className={styles.license}>{repo.license.name}</span>
        )}
      </div>
    </header>
  );
}
