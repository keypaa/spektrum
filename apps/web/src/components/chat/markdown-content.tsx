"use client";

import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

const components: Components = {
  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
  ul: ({ children }) => (
    <ul className="mb-2 list-disc space-y-1 pl-5">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-2 list-decimal space-y-1 pl-5">{children}</ol>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-text-editor-primary">{children}</strong>
  ),
  em: ({ children }) => <em className="italic">{children}</em>,
  h1: ({ children }) => (
    <h3 className="mb-2 text-sm font-semibold text-text-editor-primary">{children}</h3>
  ),
  h2: ({ children }) => (
    <h4 className="mb-2 text-sm font-semibold text-text-editor-primary">{children}</h4>
  ),
  h3: ({ children }) => (
    <h5 className="mb-1 text-xs font-semibold text-text-editor-primary">{children}</h5>
  ),
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-[color:var(--border-brand)] underline underline-offset-2"
    >
      {children}
    </a>
  ),
  blockquote: ({ children }) => (
    <blockquote className="mb-2 border-l-2 border-[color:var(--border-outline)] pl-3 text-text-editor-secondary">
      {children}
    </blockquote>
  ),
  pre: ({ children }) => (
    <pre className="mb-2 overflow-x-auto rounded-lg bg-bg-code p-2 font-mono text-[11px] leading-4">
      {children}
    </pre>
  ),
  code: ({ children, className }) =>
    className?.startsWith("language-") ? (
      <code className={className}>{children}</code>
    ) : (
      <code className="rounded bg-bg-tertiary px-1 py-0.5 font-mono text-[11px] text-text-editor-primary">
        {children}
      </code>
    ),
  table: ({ children }) => (
    <div className="mb-2 overflow-x-auto">
      <table className="w-full border-collapse text-left">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border-b border-[color:var(--border-outline)] px-2 py-1 font-semibold">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border-b border-[color:var(--border-log)] px-2 py-1">{children}</td>
  ),
};

/**
 * Models often emit LaTeX's `\(...\)` / `\[...\]` delimiters, which
 * remark-math does not recognise. Convert them to `$…$` / `$$…$$`, and
 * rescue a half-written pair like `\(E=5$ to $E=8$`.
 */
export function normalizeLatexDelimiters(text: string): string {
  const balanced = text
    .replace(/\\\(([\s\S]*?)\\\)/g, (_match, inner: string) => `$${inner}$`)
    .replace(/\\\[([\s\S]*?)\\\]/g, (_match, inner: string) => `$$${inner}$$`);
  return balanced
    .replace(/\\\[/g, "$$")
    .replace(/\\\]/g, "$$")
    .replace(/\\\(/g, "$")
    .replace(/\\\)/g, "$");
}

/** Chat-flavoured markdown with GFM and KaTeX math. */
export function MarkdownContent({ content }: { content: string }) {
  return (
    <div className="text-xs leading-5 text-text-editor-primary">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={components}
      >
        {normalizeLatexDelimiters(content)}
      </ReactMarkdown>
    </div>
  );
}
