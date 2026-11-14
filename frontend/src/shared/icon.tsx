import type { ReactNode } from "react";

const paths = {
  logo: (
    <>
      <path d="m5 3-4 5 4 5m6-10 4 5-4 5M9 2 7 14" />
    </>
  ),
  search: (
    <>
      <circle cx="7" cy="7" r="4.5" />
      <path d="m10.5 10.5 3.5 3.5" />
    </>
  ),
  arrow: <path d="M2 8h12m-5-5 5 5-5 5" />,
  sun: (
    <>
      <circle cx="8" cy="8" r="3" />
      <path d="M8 1v1m0 12v1M1 8h1m12 0h1M3 3l1 1m8 8 1 1M3 13l1-1m8-8 1-1" />
    </>
  ),
  moon: <path d="M14 10A6.5 6.5 0 0 1 6 2a6.5 6.5 0 1 0 8 8Z" />,
  lock: (
    <>
      <rect x="3" y="7" width="10" height="7" rx="1.5" />
      <path d="M5 7V4a3 3 0 0 1 6 0v3m-3 3v1" />
    </>
  ),
  star: (
    <path d="m8 1.5 2 4.2 4.5.6-3.3 3.2.8 4.5-4-2.1-4 2.1.8-4.5L1.5 6.3l4.5-.6Z" />
  ),
  clock: (
    <>
      <circle cx="8" cy="8" r="6" />
      <path d="M8 4v4l3 2" />
    </>
  ),
  tag: (
    <>
      <path d="M2 2h6l6 6-6 6-6-6Z" />
      <circle cx="5" cy="5" r=".75" />
    </>
  ),
  users: (
    <>
      <circle cx="6" cy="5" r="2.5" />
      <path d="M1 14v-2a5 5 0 0 1 10 0v2m0-11a2.5 2.5 0 0 1 0 5m2 2a4 4 0 0 1 2 4" />
    </>
  ),
  organization: (
    <>
      <path d="M3 14V2h10v12M1 14h14M6 5h.01M10 5h.01M6 8h.01M10 8h.01M7 14v-3h2v3" />
    </>
  ),
  wrap: (
    <>
      <path d="M2 4h12M2 8h10a2 2 0 0 1 0 4H8m2-2-2 2 2 2M2 12h3" />
    </>
  ),
  panel: (
    <>
      <rect x="1.5" y="2" width="13" height="12" rx="1" />
      <path d="M6 2v12M3.5 5h.01m-.01 3h.01m-.01 3h.01" />
    </>
  ),
  close: <path d="m4 4 8 8m0-8-8 8" />,
  chevron: <path d="m6 4 4 4-4 4" />,
  folder: <path d="M1.5 4.5h5l1.5 1.5h6.5v7h-13zm0 0v-2h4l1.5 2" />,
  "folder-open": (
    <>
      <path d="M1.5 7V3h4l1.5 1.5h6V7" />
      <path d="M1.5 7h13l-2 6h-11z" />
    </>
  ),
  file: (
    <>
      <path d="M9.5 1.5h-6v13h9v-10zM9.5 1.5v3h3" />
      <path d="M5.5 8h5m-5 2.5h4" />
    </>
  ),
  code: (
    <>
      <path d="M9.5 1.5h-6v13h9v-10zM9.5 1.5v3h3" />
      <path d="m6.5 7-2 2 2 2m3-4 2 2-2 2" />
    </>
  ),
  markdown: (
    <>
      <path d="M2 3h12v10H2z" />
      <path d="M4 10V6l2 2 2-2v4m3-4v4m-1-1 1 1 1-1" />
    </>
  ),
  image: (
    <>
      <path d="M2 2h12v12H2zM2 12l4-4 3 3 2-2 3 3" />
      <circle cx="10.5" cy="5.5" r="1" />
    </>
  ),
  settings: (
    <>
      <path d="M2 4h12M2 8h12M2 12h12" />
      <path d="M5 2v4m6 0v4m-5 0v4" />
    </>
  ),
  branch: (
    <>
      <circle cx="4" cy="3" r="1.5" />
      <circle cx="12" cy="4" r="1.5" />
      <circle cx="4" cy="13" r="1.5" />
      <path d="M4 4.5v7m8-6c0 4-8 1-8 5" />
    </>
  ),
  download: (
    <>
      <path d="M8 1.5v8m-3-3 3 3 3-3M2.5 10v3.5h11V10" />
    </>
  ),
  repository: (
    <>
      <path d="M3 2h10v12H4a1 1 0 0 1-1-1zm0 9h10M6 4v4" />
    </>
  ),
} satisfies Record<string, ReactNode>;

export function Icon({
  name,
  className = "",
}: {
  name: keyof typeof paths;
  className?: string | undefined;
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {paths[name]}
    </svg>
  );
}
