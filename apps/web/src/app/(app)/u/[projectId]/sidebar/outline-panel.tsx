"use client";

import { useEffect, useRef, useState } from "react";
import { IconChevronDown, IconChevronRight } from "@spektrum/ui/icons";
import type { OutlineNode } from "@/lib/outline";

const MIN_HEIGHT = 80;
const MAX_HEIGHT = 420;
const DEFAULT_HEIGHT = 220;

function OutlineTree({
  nodes,
  depth,
  onNavigate,
}: {
  nodes: OutlineNode[];
  depth: number;
  onNavigate(line: number): void;
}) {
  return (
    <>
      {nodes.map((node) => (
        <OutlineItem
          key={node.id}
          node={node}
          depth={depth}
          onNavigate={onNavigate}
        />
      ))}
    </>
  );
}

function OutlineItem({
  node,
  depth,
  onNavigate,
}: {
  node: OutlineNode;
  depth: number;
  onNavigate(line: number): void;
}) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <div
        className="flex items-center gap-1 rounded-md py-1 pr-1 text-xs text-text-editor-secondary hover:bg-nav-bg-hover hover:text-text-editor-primary"
        style={{ paddingLeft: 4 + depth * 14 }}
      >
        {node.children.length > 0 ? (
          <button
            type="button"
            aria-label={`Toggle ${node.title}`}
            onClick={() => setOpen((value) => !value)}
            className="flex h-4 w-4 flex-none items-center justify-center"
          >
            {open ? <IconChevronDown size={12} /> : <IconChevronRight size={12} />}
          </button>
        ) : (
          <span className="w-4 flex-none" />
        )}
        <button
          type="button"
          onClick={() => onNavigate(node.line)}
          className="min-w-0 flex-1 truncate text-left"
        >
          {node.title}
        </button>
      </div>
      {open && node.children.length > 0 ? (
        <OutlineTree
          nodes={node.children}
          depth={depth + 1}
          onNavigate={onNavigate}
        />
      ) : null}
    </>
  );
}

/** Bottom-of-sidebar section outline: collapsible and vertically resizable. */
export function OutlinePanel({
  items,
  onNavigate,
}: {
  items: OutlineNode[];
  onNavigate(line: number): void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [height, setHeight] = useState(DEFAULT_HEIGHT);
  const drag = useRef<{ startY: number; startHeight: number } | null>(null);

  useEffect(() => {
    const move = (event: PointerEvent) => {
      if (!drag.current) return;
      const next =
        drag.current.startHeight - (event.clientY - drag.current.startY);
      setHeight(Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, next)));
    };
    const stop = () => {
      if (!drag.current) return;
      drag.current = null;
      document.body.style.userSelect = "";
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      document.body.style.userSelect = "";
    };
  }, []);

  return (
    <div
      data-testid="outline-panel"
      style={collapsed ? undefined : { height }}
      className={`flex flex-none flex-col overflow-hidden border-t border-[color:var(--border-log)] ${
        collapsed ? "" : "min-h-0"
      }`}
    >
      {!collapsed ? (
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize outline"
          onPointerDown={(event) => {
            drag.current = { startY: event.clientY, startHeight: height };
            document.body.style.userSelect = "none";
          }}
          className="h-1 w-full flex-none cursor-row-resize bg-transparent hover:bg-[color:var(--border-brand)]"
        />
      ) : null}
      <button
        type="button"
        aria-label="Toggle outline"
        onClick={() => setCollapsed((value) => !value)}
        className="flex h-9 flex-none items-center gap-2 px-4 text-xs text-text-editor-secondary hover:text-text-editor-primary"
      >
        {collapsed ? <IconChevronRight size={14} /> : <IconChevronDown size={14} />}
        Outline
      </button>
      {!collapsed ? (
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {items.length > 0 ? (
            <OutlineTree nodes={items} depth={0} onNavigate={onNavigate} />
          ) : (
            <p className="px-2 py-2 text-xs text-text-editor-tertiary">
              No sections yet
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
