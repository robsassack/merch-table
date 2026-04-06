"use client";

import { useMemo, useState } from "react";

const COLLAPSED_CHAR_LIMIT = 280;

function trimForCollapsed(text: string) {
  if (text.length <= COLLAPSED_CHAR_LIMIT) {
    return text;
  }

  const sliced = text.slice(0, COLLAPSED_CHAR_LIMIT);
  const lastSpaceIndex = sliced.lastIndexOf(" ");
  const safeSlice = lastSpaceIndex > 120 ? sliced.slice(0, lastSpaceIndex) : sliced;
  return `${safeSlice.trimEnd()}...`;
}

export default function ReleaseDescription({ description }: { description: string }) {
  const [expanded, setExpanded] = useState(false);

  const normalized = useMemo(() => description.trim(), [description]);
  const isLong = normalized.length > COLLAPSED_CHAR_LIMIT;
  const content = expanded ? normalized : trimForCollapsed(normalized);

  return (
    <div className="mt-4">
      <p className="whitespace-pre-wrap text-sm text-zinc-700">{content}</p>
      {isLong ? (
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          className="mt-2 text-sm font-medium text-zinc-900 underline underline-offset-2 hover:text-emerald-700"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      ) : null}
    </div>
  );
}
