import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FileTree } from "./file-tree";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("expands a directory on demand and selects a nested file", async () => {
  const user = userEvent.setup();
  const onSelect = vi.fn();
  const fetcher = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        sha: "dir",
        tree: [{ path: "code.ts", type: "blob", sha: "file" }],
      }),
    ),
  );
  vi.stubGlobal("fetch", fetcher);
  render(
    <FileTree
      base="/api/github/repos/o/r"
      tree={{ sha: "root", tree: [{ path: "src", type: "tree", sha: "dir" }] }}
      selected=""
      onSelect={onSelect}
    />,
  );
  expect(fetcher).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: /src/ }));
  await user.click(await screen.findByRole("button", { name: /code.ts/ }));
  expect(onSelect).toHaveBeenCalledWith("src/code.ts");
  expect(fetcher.mock.calls[0]?.[0]).toBe(
    "/api/github/repos/o/r/git/trees/dir",
  );
});
