"use client";

export function Comments(): React.ReactElement {
  return (
    <div className="flex flex-col gap-2 p-2">
      <div className="flex items-center gap-2">
        <select
          aria-label="Comments filter"
          className="h-8 rounded-md border border-[color:var(--border-log)] bg-transparent px-2 text-sm"
        >
          <option>All Comments</option>
          <option>Only Unresolved</option>
          <option>Only Resolved</option>
          <option>Your Comments and Mentions</option>
        </select>
        <input
          aria-label="Search comments"
          placeholder="Search"
          className="h-8 flex-1 rounded-md border border-[color:var(--border-log)] bg-transparent px-2 text-sm"
        />
      </div>
      <p className="p-4 text-sm text-fg-tertiary">No comments yet</p>
    </div>
  );
}