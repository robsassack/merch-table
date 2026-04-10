"use client";

import {
  Fragment,
  type CSSProperties,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { toSafeMarkdownHref } from "@/lib/content/markdown";

const COLLAPSED_MAX_HEIGHT_PX = 144;
const COLLAPSED_FADE_MASK: CSSProperties = {
  maskImage: "linear-gradient(to bottom, black 70%, transparent 100%)",
  WebkitMaskImage: "linear-gradient(to bottom, black 70%, transparent 100%)",
};

type OrderedListBlock = {
  type: "ordered-list";
  items: string[];
  start: number;
};

type UnorderedListBlock = {
  type: "unordered-list";
  items: string[];
};

type ParagraphBlock = {
  type: "paragraph";
  text: string;
};

type HeadingBlock = {
  type: "heading";
  level: 1 | 2 | 3 | 4 | 5 | 6;
  text: string;
};

type QuoteBlock = {
  type: "quote";
  text: string;
};

type CodeBlock = {
  type: "code";
  code: string;
};

type MarkdownBlock =
  | OrderedListBlock
  | UnorderedListBlock
  | ParagraphBlock
  | HeadingBlock
  | QuoteBlock
  | CodeBlock;

function linkPropsForHref(href: string): {
  rel?: string;
  target?: "_blank";
} {
  if (href.startsWith("http://") || href.startsWith("https://") || href.startsWith("mailto:")) {
    return {
      target: "_blank",
      rel: "noopener noreferrer nofollow",
    };
  }

  return {};
}

function parseMarkdownBlocks(markdown: string): MarkdownBlock[] {
  const lines = markdown.split(/\r?\n/);
  const blocks: MarkdownBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const rawLine = lines[index] ?? "";
    const line = rawLine.trimEnd();

    if (line.trim().length === 0) {
      index += 1;
      continue;
    }

    if (/^```/.test(line)) {
      index += 1;
      const codeLines: string[] = [];
      while (index < lines.length && !/^```/.test(lines[index] ?? "")) {
        codeLines.push(lines[index] ?? "");
        index += 1;
      }
      if (index < lines.length) {
        index += 1;
      }
      blocks.push({ type: "code", code: codeLines.join("\n") });
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length as 1 | 2 | 3 | 4 | 5 | 6;
      blocks.push({ type: "heading", level, text: headingMatch[2].trim() });
      index += 1;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quoteLines: string[] = [];
      while (index < lines.length) {
        const quoteLine = (lines[index] ?? "").trimEnd();
        if (!/^>\s?/.test(quoteLine)) {
          break;
        }
        quoteLines.push(quoteLine.replace(/^>\s?/, ""));
        index += 1;
      }
      blocks.push({ type: "quote", text: quoteLines.join(" ").trim() });
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length) {
        const listLine = (lines[index] ?? "").trimEnd();
        const match = listLine.match(/^[-*]\s+(.+)$/);
        if (!match) {
          break;
        }
        items.push(match[1].trim());
        index += 1;
      }
      blocks.push({ type: "unordered-list", items });
      continue;
    }

    const orderedMatch = line.match(/^(\d+)\.\s+(.+)$/);
    if (orderedMatch) {
      const start = Number(orderedMatch[1]);
      const items: string[] = [];
      while (index < lines.length) {
        const listLine = (lines[index] ?? "").trimEnd();
        const match = listLine.match(/^\d+\.\s+(.+)$/);
        if (!match) {
          break;
        }
        items.push(match[1].trim());
        index += 1;
      }
      blocks.push({ type: "ordered-list", start, items });
      continue;
    }

    const paragraphLines: string[] = [];
    while (index < lines.length) {
      const candidate = (lines[index] ?? "").trimEnd();
      if (
        candidate.trim().length === 0 ||
        /^```/.test(candidate) ||
        /^(#{1,6})\s+/.test(candidate) ||
        /^>\s?/.test(candidate) ||
        /^[-*]\s+/.test(candidate) ||
        /^\d+\.\s+/.test(candidate)
      ) {
        break;
      }
      paragraphLines.push(candidate.trim());
      index += 1;
    }
    blocks.push({ type: "paragraph", text: paragraphLines.join(" ") });
  }

  return blocks;
}

function parseInline(markdown: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern =
    /(\[[^\]]+\]\([^\)]+\)|https?:\/\/[^\s<]+|mailto:[^\s<]+|`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g;

  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(markdown)) !== null) {
    const token = match[0];
    const index = match.index;

    if (index > cursor) {
      nodes.push(markdown.slice(cursor, index));
    }

    const markdownLinkMatch = token.match(/^\[([^\]]+)\]\(([^\)]+)\)$/);
    if (markdownLinkMatch) {
      const label = markdownLinkMatch[1] ?? "";
      const href = toSafeMarkdownHref(markdownLinkMatch[2] ?? "");
      const linkProps = href ? linkPropsForHref(href) : {};
      nodes.push(
        href ? (
          <a
            key={`${index}-${token}`}
            href={href}
            target={linkProps.target}
            rel={linkProps.rel}
            className="underline decoration-[var(--release-accent)] decoration-2 underline-offset-2 transition-colors hover:text-[var(--release-accent-hover)]"
          >
            {parseInline(label)}
          </a>
        ) : (
          token
        ),
      );
      cursor = index + token.length;
      continue;
    }

    const autoLinkedHref = toSafeMarkdownHref(token);
    if (autoLinkedHref) {
      const linkProps = linkPropsForHref(autoLinkedHref);
      nodes.push(
        <a
          key={`${index}-${token}`}
          href={autoLinkedHref}
          target={linkProps.target}
          rel={linkProps.rel}
          className="underline decoration-[var(--release-accent)] decoration-2 underline-offset-2 transition-colors hover:text-[var(--release-accent-hover)]"
        >
          {token}
        </a>,
      );
      cursor = index + token.length;
      continue;
    }

    const codeMatch = token.match(/^`([^`]+)`$/);
    if (codeMatch) {
      nodes.push(
        <code
          key={`${index}-${token}`}
          className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[0.92em] text-zinc-800"
        >
          {codeMatch[1]}
        </code>,
      );
      cursor = index + token.length;
      continue;
    }

    const boldMatch = token.match(/^\*\*([^*]+)\*\*$/);
    if (boldMatch) {
      nodes.push(<strong key={`${index}-${token}`}>{parseInline(boldMatch[1] ?? "")}</strong>);
      cursor = index + token.length;
      continue;
    }

    const italicMatch = token.match(/^\*([^*]+)\*$/);
    if (italicMatch) {
      nodes.push(<em key={`${index}-${token}`}>{parseInline(italicMatch[1] ?? "")}</em>);
      cursor = index + token.length;
      continue;
    }

    nodes.push(token);
    cursor = index + token.length;
  }

  if (cursor < markdown.length) {
    nodes.push(markdown.slice(cursor));
  }

  return nodes;
}

function renderBlock(block: MarkdownBlock, key: string): ReactNode {
  switch (block.type) {
    case "heading": {
      const headingClassName =
        block.level === 1
          ? "mt-3 text-lg font-semibold text-zinc-900"
          : block.level === 2
            ? "mt-3 text-base font-semibold text-zinc-900"
            : "mt-2 text-sm font-semibold text-zinc-900";
      const HeadingTag = `h${block.level}` as const;
      return <HeadingTag className={headingClassName}>{parseInline(block.text)}</HeadingTag>;
    }
    case "paragraph":
      return <p className="text-sm leading-6 text-zinc-700">{parseInline(block.text)}</p>;
    case "quote":
      return (
        <blockquote className="border-l-2 border-zinc-300 pl-3 text-sm italic leading-6 text-zinc-600">
          {parseInline(block.text)}
        </blockquote>
      );
    case "code":
      return (
        <pre className="overflow-x-auto rounded-md bg-zinc-100 p-3 text-xs text-zinc-800">
          <code>{block.code}</code>
        </pre>
      );
    case "unordered-list":
      return (
        <ul className="list-disc space-y-1 pl-5 text-sm leading-6 text-zinc-700">
          {block.items.map((item, itemIndex) => (
            <li key={`${key}-ul-${itemIndex}`}>{parseInline(item)}</li>
          ))}
        </ul>
      );
    case "ordered-list":
      return (
        <ol start={block.start} className="list-decimal space-y-1 pl-5 text-sm leading-6 text-zinc-700">
          {block.items.map((item, itemIndex) => (
            <li key={`${key}-ol-${itemIndex}`}>{parseInline(item)}</li>
          ))}
        </ol>
      );
    default:
      return null;
  }
}

export default function ArtistBio({
  bio,
  collapsible = true,
}: {
  bio: string | null | undefined;
  collapsible?: boolean;
}) {
  const [expandedByBio, setExpandedByBio] = useState<{
    bio: string;
    expanded: boolean;
  }>({
    bio: "",
    expanded: false,
  });
  const [canCollapse, setCanCollapse] = useState(false);
  const contentRef = useRef<HTMLDivElement | null>(null);

  const normalized = useMemo(() => bio?.trim() ?? "", [bio]);
  const blocks = useMemo(() => parseMarkdownBlocks(normalized), [normalized]);
  const expanded = expandedByBio.bio === normalized ? expandedByBio.expanded : false;

  useEffect(() => {
    if (!collapsible) {
      setCanCollapse(false);
      return;
    }

    const contentElement = contentRef.current;
    if (!contentElement) {
      return;
    }

    const measureOverflow = () => {
      setCanCollapse(contentElement.scrollHeight > COLLAPSED_MAX_HEIGHT_PX + 1);
    };

    measureOverflow();

    if (typeof ResizeObserver === "function") {
      const resizeObserver = new ResizeObserver(measureOverflow);
      resizeObserver.observe(contentElement);
      return () => {
        resizeObserver.disconnect();
      };
    }

    window.addEventListener("resize", measureOverflow);
    return () => {
      window.removeEventListener("resize", measureOverflow);
    };
  }, [blocks, collapsible]);

  if (!normalized) {
    return <p className="text-sm text-zinc-700">No artist bio added yet.</p>;
  }

  return (
    <div>
      <div
        className={collapsible && canCollapse && !expanded ? "max-h-36 overflow-hidden" : undefined}
        style={collapsible && canCollapse && !expanded ? COLLAPSED_FADE_MASK : undefined}
      >
        <div ref={contentRef} className="space-y-3">
          {blocks.map((block, index) => (
            <Fragment key={`artist-bio-${index}`}>{renderBlock(block, `artist-bio-${index}`)}</Fragment>
          ))}
        </div>
      </div>
      {collapsible && canCollapse ? (
        <button
          type="button"
          onClick={() =>
            setExpandedByBio({
              bio: normalized,
              expanded: !expanded,
            })
          }
          className="mt-2 cursor-pointer text-sm font-medium text-zinc-900 underline underline-offset-2 hover:text-[var(--release-accent-hover)]"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      ) : null}
    </div>
  );
}
