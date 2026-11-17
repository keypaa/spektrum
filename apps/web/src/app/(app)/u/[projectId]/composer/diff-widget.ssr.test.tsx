// @vitest-environment node
// Production-only regression: the editor route answered HTTP 500 with
// "ReferenceError: window is not defined" because this Client Component
// statically imported `@/editor/monaco-environment`, and Client Components are
// prerendered on the server. `next dev` never evaluated the module eagerly, so
// the whole unit suite and the dev-server e2e missed it; the production build
// (and the visual CI job, which runs `next start`) did not.
//
// Node environment on purpose: there is no `window` here, exactly like the
// server. Importing the component and rendering it must not touch Monaco.
import { renderToString } from "react-dom/server";
import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import type { MessagePart } from "@spektrum/shared/ai";
import { DiffWidget } from "./diff-widget";

const PART: Extract<MessagePart, { type: "diff" }> = {
  type: "diff",
  id: "d1",
  messageId: "m1",
  proposal: {
    path: "main.tex",
    kind: "replace",
    hunks: [],
    originalHash: "h",
    proposedContent: "a\nB\nc\n",
    reason: "fix",
  },
  status: "pending",
};

describe("DiffWidget on the server", () => {
  it("renders without evaluating browser-only Monaco", () => {
    const html = renderToString(
      createElement(DiffWidget, {
        part: PART,
        original: "a\nb\nc\n",
        projectId: "p1",
        threadId: "t1",
        onAccept: vi.fn(async () => ({ ok: true as const })),
        onReject: vi.fn(async () => {}),
        onRerun: vi.fn(),
        onStatus: vi.fn(),
      }),
    );
    expect(html).toContain('data-testid="diff-widget"');
  });
});
