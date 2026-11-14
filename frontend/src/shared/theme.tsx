import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
  type ReactNode,
} from "react";
import { Icon } from "./icon";
type Theme = "light" | "dark";
const Context = createContext<{ theme: Theme; toggle: () => void } | null>(
  null,
);
function savedTheme(): Theme | null {
  // Preferences are optional when browser storage is disabled.
  try {
    const value = localStorage.getItem("reader-theme");
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null;
  }
}
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [choice, setChoice] = useState(savedTheme);
  const [system, setSystem] = useState<Theme>(() =>
    matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light",
  );
  const theme = choice ?? system;
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const update = () => setSystem(media.matches ? "dark" : "light");
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    setChoice(next);
    try {
      localStorage.setItem("reader-theme", next);
    } catch {
      /* Keep the choice for this session when storage is unavailable. */
    }
  };
  return <Context value={{ theme, toggle }}>{children}</Context>;
}
export function useTheme() {
  const value = useContext(Context);
  if (!value) throw new Error("ThemeProvider is missing");
  return value;
}
export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button
      className="icon-button"
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
      title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
    >
      <Icon name={theme === "dark" ? "sun" : "moon"} />
    </button>
  );
}
