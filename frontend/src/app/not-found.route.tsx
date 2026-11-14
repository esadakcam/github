import { Link } from "react-router";
export function Component() {
  return (
    <div className="error-page">
      <h1>Page not found</h1>
      <Link to="/">Back to search</Link>
    </div>
  );
}
