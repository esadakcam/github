import { useEffect, useRef } from "react";
import * as monaco from "monaco-editor/editor/editor.api.js";
import "monaco-editor/basic-languages/monaco.contribution.js";
import "monaco-editor/editor/contrib/find/browser/findController.js";
import "monaco-editor/editor/contrib/clipboard/browser/clipboard.js";
import EditorWorker from "monaco-editor/editor/editor.worker.js?worker";
import { useTheme } from "../../shared/theme";
import styles from "./repository.module.css";

// Vite emits the worker as a local asset. No loader or runtime CDN is involved.
globalThis.MonacoEnvironment = { getWorker: () => new EditorWorker() };

monaco.editor.defineTheme("reader-dark", {
  base: "vs-dark",
  inherit: true,
  rules: [],
  colors: {
    "editor.background": "#15171b",
    "editorGutter.background": "#15171b",
    "editorLineNumber.foreground": "#565f6f",
    "editor.selectionBackground": "#254772",
    "editor.inactiveSelectionBackground": "#252e3e",
  },
});
monaco.editor.defineTheme("reader-light", {
  base: "vs",
  inherit: true,
  rules: [],
  colors: {
    "editor.background": "#ffffff",
    "editorGutter.background": "#ffffff",
    "editorLineNumber.foreground": "#8a94a5",
    "editor.selectionBackground": "#dce7fc",
  },
});
export function CodeEditor({
  value,
  path,
  wrap,
}: {
  value: string;
  path: string;
  wrap: boolean;
}) {
  const { theme } = useTheme();
  const instance = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  useEffect(() => {
    monaco.editor.setTheme(`reader-${theme}`);
  }, [theme]);
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!container.current) return;
    const model = monaco.editor.createModel(
      value,
      undefined,
      monaco.Uri.from({ scheme: "file", path: `/${path}` }),
    );
    const editor = monaco.editor.create(container.current, {
      model,
      readOnly: true,
      domReadOnly: true,
      ariaLabel: "Read-only source code",
      automaticLayout: true,
      minimap: { enabled: false },
      fontSize: 13,
      scrollBeyondLastLine: false,
      renderLineHighlight: "none",
      contextmenu: false,
      links: false,
      wordBasedSuggestions: "off",
      quickSuggestions: false,
      tabFocusMode: true,
      padding: { top: 16, bottom: 16 },
    });
    instance.current = editor;
    return () => {
      instance.current = null;
      editor.dispose();
      model.dispose();
    };
  }, [value, path]);
  useEffect(() => {
    instance.current?.updateOptions({ wordWrap: wrap ? "on" : "off" });
  }, [wrap]);
  return (
    <div ref={container} className={styles.editor} aria-label="Source editor" />
  );
}
