import { SearchForm } from "./search-form";
import styles from "./search.module.css";
export function Component() {
  return (
    <div className={styles.home}>
      <div className={styles.homeSearch}>
        <SearchForm autoFocus />
        <p className={styles.hint}>
          <span>
            Enter an exact account, topic, or <code>owner/repo</code>
          </span>
          <span>
            <kbd>↵</kbd> to search
          </span>
        </p>
      </div>
    </div>
  );
}
