// Monaco environment — ESM workers and the two themes (spec §7.1/§7.3).
//
// Monaco's language services run in web workers. With Turbopack the ESM
// `new Worker(new URL(...))` form bundles; if a future bundler change breaks
// that, the fallback is the AMD loader from `public/monaco/vs` (D42) — the
// MonacoEditor props/handle stay identical either way.

import * as monaco from "monaco-editor";
import { registerMonacoThemes } from "./themes";

let registered = false;

export function setupMonacoEnvironment(): void {
  if (registered) return;
  registered = true;

  self.MonacoEnvironment = {
    getWorker(_, label) {
      // LaTeX has no worker (the Monarch tokenizer is main-thread); JSON is
      // the only language service this app ships in Phase 2. NOTE: monaco 0.57's
      // exports map is "./*.js": "./esm/vs/*.js", so the worker subpath is
      // "editor/editor.worker.js" — the old "esm/vs/..." form does not resolve.
      if (label === "json") {
        return new Worker(
          new URL("monaco-editor/language/json/json.worker.js", import.meta.url),
          { type: "module" },
        );
      }
      return new Worker(
        new URL("monaco-editor/editor/editor.worker.js", import.meta.url),
        { type: "module" },
      );
    },
  };

  registerMonacoThemes(monaco);
}

export { monaco };