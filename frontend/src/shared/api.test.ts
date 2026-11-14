import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { readFile, request, segment } from "./api";
afterEach(() => vi.unstubAllGlobals());
describe("proxy boundary", () => {
  it("escapes refs and search text as a single path segment", () => {
    expect(segment("feature/a?b#c")).toBe("feature%2Fa%3Fb%23c");
  });
  it("rejects invalid upstream JSON shapes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response('{"items":"bad"}')),
    );
    await expect(
      request(
        "/api/resource",
        z.object({ items: z.array(z.string()) }),
        new AbortController().signal,
      ),
    ).rejects.toThrow("unexpected response");
  });
  it("preserves a useful upstream error status and message", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response('{"message":"Rate limited"}', { status: 429 }),
        ),
    );
    try {
      await request("/api/resource", z.unknown(), new AbortController().signal);
      throw new Error("expected rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(Response);
      if (error instanceof Response) {
        expect(error.status).toBe(429);
        expect(await error.json()).toEqual({ message: "Rate limited" });
      }
    }
  });
  it("passes cancellation to fetch", async () => {
    const controller = new AbortController();
    const fetcher = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetcher);
    await request("/api/resource", z.object({}), controller.signal);
    expect(fetcher).toHaveBeenCalledWith("/api/resource", {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
  });
});
describe("file decoding", () => {
  it("keeps markup as plain text", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("<script>alert(1)</script>")),
    );
    expect(
      await readFile("/api/raw/file", new AbortController().signal),
    ).toEqual({ binary: false, text: "<script>alert(1)</script>" });
  });
  it("detects binary files", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(new Uint8Array([0, 255, 1]))),
    );
    expect(
      await readFile("/api/raw/file", new AbortController().signal),
    ).toEqual({ binary: true, text: "" });
  });
  it("reports failed downloads", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("", { status: 404 })),
    );
    await expect(
      readFile("/api/raw/file", new AbortController().signal),
    ).rejects.toThrow("404");
  });
});
