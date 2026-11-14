import { z } from "zod";

export const userSchema = z.object({
  login: z.string(),
  name: z.string().nullable().optional(),
  type: z.string().default("User"),
  bio: z.string().nullable().optional(),
});
export const repositorySchema = z.object({
  name: z.string(),
  full_name: z.string(),
  description: z.string().nullable().default(null),
  default_branch: z.string(),
  stargazers_count: z.number().int().nonnegative(),
  forks_count: z.number().int().nonnegative().optional(),
  language: z.string().nullable().default(null),
  topics: z.array(z.string()).default([]),
  owner: userSchema,
  license: z.object({ name: z.string() }).nullable().optional(),
});
export type Repository = z.infer<typeof repositorySchema>;
export const searchSchema = z.object({
  repositories: z.array(repositorySchema),
  users: z.array(userSchema),
  topics: z.array(
    z.object({ name: z.string(), stars: z.number(), repositories: z.number() }),
  ),
  warnings: z.array(z.string()),
  scope: z.string(),
});
export const treeSchema = z.object({
  sha: z.string(),
  truncated: z.boolean().optional(),
  tree: z.array(
    z.object({
      path: z.string(),
      type: z.enum(["tree", "blob", "commit"]),
      sha: z.string(),
      mode: z.string().optional(),
      size: z.number().optional(),
    }),
  ),
});
export type Tree = z.infer<typeof treeSchema>;
export type Entry = Tree["tree"][number];
export const refsSchema = z.array(
  z.object({ name: z.string(), commit: z.object({ sha: z.string() }) }),
);
export const commitSchema = z.object({
  sha: z.string(),
  commit: z.object({
    message: z.string(),
    author: z.object({ name: z.string(), date: z.string() }).nullable(),
  }),
  parents: z.array(z.object({ sha: z.string() })),
  files: z
    .array(
      z.object({
        filename: z.string(),
        status: z.string(),
        patch: z.string().optional(),
      }),
    )
    .optional(),
});
export function segment(value: string): string {
  return encodeURIComponent(value);
}
export function repoAPI(owner: string, repo: string): string {
  return `/api/github/repos/${segment(owner)}/${segment(repo)}`;
}

export const requestErrorSchema = z.object({
  message: z.string(),
  code: z.string().optional(),
  retry_at: z.string().datetime().optional(),
});

export async function request<T>(
  path: string,
  schema: z.ZodType<T>,
  signal: AbortSignal,
): Promise<T> {
  const response = await fetch(path, {
    signal,
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    const error: unknown = await response.json().catch(() => null);
    const parsed = requestErrorSchema.safeParse(error);
    const payload = parsed.success
      ? parsed.data
      : { message: `Request failed (HTTP ${response.status})` };
    throw new Response(JSON.stringify(payload), {
      status: response.status,
      statusText: response.statusText,
      headers: { "Content-Type": "application/json" },
    });
  }
  const parsed = schema.safeParse(await response.json());
  if (!parsed.success)
    throw new Error("The proxy returned an unexpected response.");
  return parsed.data;
}

// File bytes are never rendered as HTML or executed. Binary files remain downloadable.
export async function readFile(
  path: string,
  signal: AbortSignal,
): Promise<{ binary: boolean; text: string }> {
  const response = await fetch(path, { signal });
  if (!response.ok)
    throw new Error(`Could not load file (HTTP ${response.status}).`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length > 16 * 1024 * 1024)
    throw new Error("File exceeds the 16 MiB limit.");
  if (bytes.some((byte) => byte === 0)) return { binary: true, text: "" };
  try {
    return {
      binary: false,
      text: new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    };
  } catch {
    return { binary: true, text: "" };
  }
}
