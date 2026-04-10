"use client";

import {
  Bold,
  Code,
  Heading2,
  Italic,
  Link2,
  List,
  ListOrdered,
  Quote,
} from "lucide-react";
import { type KeyboardEvent, type ReactNode, useRef } from "react";

type MarkdownTextareaProps = {
  maxLength?: number;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  value: string;
};

type EditResult = {
  nextSelectionEnd: number;
  nextSelectionStart: number;
  nextValue: string;
};

type HistoryEntry = {
  selectionEnd: number;
  selectionStart: number;
  value: string;
};

const toolbarButtonClassName =
  "inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-600 bg-slate-900 text-zinc-200 transition hover:border-slate-400 hover:text-zinc-100 focus-visible:border-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/60 disabled:cursor-not-allowed disabled:opacity-60";
const toolbarIconClassName = "h-4 w-4";

type ToolbarButtonProps = {
  children: ReactNode;
  label: string;
  onClick: () => void;
};

function ToolbarButton({ label, onClick, children }: ToolbarButtonProps) {
  return (
    <button type="button" className={toolbarButtonClassName} onClick={onClick} aria-label={label} title={label}>
      {children}
    </button>
  );
}

function applyLinePrefix(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  prefixLine: (line: string, index: number) => string,
): EditResult {
  const blockStart = value.lastIndexOf("\n", Math.max(selectionStart - 1, 0)) + 1;
  const blockEndIndex = value.indexOf("\n", selectionEnd);
  const blockEnd = blockEndIndex === -1 ? value.length : blockEndIndex;
  const selectedBlock = value.slice(blockStart, blockEnd);
  const updatedBlock = selectedBlock
    .split("\n")
    .map((line, index) => prefixLine(line, index))
    .join("\n");
  const nextValue = `${value.slice(0, blockStart)}${updatedBlock}${value.slice(blockEnd)}`;
  return {
    nextValue,
    nextSelectionStart: blockStart,
    nextSelectionEnd: blockStart + updatedBlock.length,
  };
}

function applyInlineWrap(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  prefix: string,
  suffix: string,
  placeholder: string,
): EditResult {
  const selectedText = value.slice(selectionStart, selectionEnd);
  const replacement = `${prefix}${selectedText || placeholder}${suffix}`;
  const nextValue = `${value.slice(0, selectionStart)}${replacement}${value.slice(selectionEnd)}`;
  return selectedText.length > 0
    ? {
        nextValue,
        nextSelectionStart: selectionStart + prefix.length,
        nextSelectionEnd: selectionStart + prefix.length + selectedText.length,
      }
    : {
        nextValue,
        nextSelectionStart: selectionStart + prefix.length,
        nextSelectionEnd: selectionStart + prefix.length + placeholder.length,
      };
}

function applyLink(value: string, selectionStart: number, selectionEnd: number): EditResult {
  const selectedText = value.slice(selectionStart, selectionEnd);
  const label = selectedText || "link text";
  const url = "https://example.com";
  const replacement = `[${label}](${url})`;
  const nextValue = `${value.slice(0, selectionStart)}${replacement}${value.slice(selectionEnd)}`;
  const urlStart = selectionStart + replacement.indexOf(url);
  return {
    nextValue,
    nextSelectionStart: urlStart,
    nextSelectionEnd: urlStart + url.length,
  };
}

export function MarkdownTextarea({
  value,
  onChange,
  rows = 3,
  maxLength = 4_000,
  placeholder,
}: MarkdownTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const undoHistoryRef = useRef<HistoryEntry[]>([]);
  const redoHistoryRef = useRef<HistoryEntry[]>([]);

  const getSnapshot = (textarea: HTMLTextAreaElement): HistoryEntry => ({
    value,
    selectionStart: textarea.selectionStart ?? 0,
    selectionEnd: textarea.selectionEnd ?? textarea.selectionStart ?? 0,
  });

  const focusAndSetSelection = (selectionStart: number, selectionEnd: number) => {
    requestAnimationFrame(() => {
      const nextTextarea = textareaRef.current;
      if (!nextTextarea) {
        return;
      }
      nextTextarea.focus();
      nextTextarea.setSelectionRange(selectionStart, selectionEnd);
    });
  };

  const runEdit = (editor: (value: string, selectionStart: number, selectionEnd: number) => EditResult) => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    undoHistoryRef.current.push(getSnapshot(textarea));
    redoHistoryRef.current = [];

    const selectionStart = textarea.selectionStart ?? 0;
    const selectionEnd = textarea.selectionEnd ?? selectionStart;
    const edit = editor(value, selectionStart, selectionEnd);
    onChange(edit.nextValue);
    focusAndSetSelection(edit.nextSelectionStart, edit.nextSelectionEnd);
  };

  const handleUndoRedoKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    const textarea = textareaRef.current;
    if (!textarea || !(event.metaKey || event.ctrlKey) || event.altKey) {
      return;
    }

    const pressedZ = event.key.toLowerCase() === "z";
    const pressedY = event.key.toLowerCase() === "y";
    const wantsRedo = pressedY || (pressedZ && event.shiftKey);
    const wantsUndo = pressedZ && !event.shiftKey;

    if (!wantsUndo && !wantsRedo) {
      return;
    }

    if (wantsUndo) {
      const previous = undoHistoryRef.current.pop();
      if (!previous) {
        return;
      }
      event.preventDefault();
      redoHistoryRef.current.push(getSnapshot(textarea));
      onChange(previous.value);
      focusAndSetSelection(previous.selectionStart, previous.selectionEnd);
      return;
    }

    const next = redoHistoryRef.current.pop();
    if (!next) {
      return;
    }
    event.preventDefault();
    undoHistoryRef.current.push(getSnapshot(textarea));
    onChange(next.value);
    focusAndSetSelection(next.selectionStart, next.selectionEnd);
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        <ToolbarButton
          label="Bold"
          onClick={() => runEdit((current, start, end) => applyInlineWrap(current, start, end, "**", "**", "bold text"))}
        >
          <Bold aria-hidden="true" className={toolbarIconClassName} />
        </ToolbarButton>
        <ToolbarButton
          label="Italic"
          onClick={() => runEdit((current, start, end) => applyInlineWrap(current, start, end, "*", "*", "italic text"))}
        >
          <Italic aria-hidden="true" className={toolbarIconClassName} />
        </ToolbarButton>
        <ToolbarButton
          label="Code"
          onClick={() => runEdit((current, start, end) => applyInlineWrap(current, start, end, "`", "`", "code"))}
        >
          <Code aria-hidden="true" className={toolbarIconClassName} />
        </ToolbarButton>
        <ToolbarButton label="Link" onClick={() => runEdit((current, start, end) => applyLink(current, start, end))}>
          <Link2 aria-hidden="true" className={toolbarIconClassName} />
        </ToolbarButton>
        <ToolbarButton
          label="Heading"
          onClick={() => runEdit((current, start, end) => applyLinePrefix(current, start, end, (line) => `## ${line}`))}
        >
          <Heading2 aria-hidden="true" className={toolbarIconClassName} />
        </ToolbarButton>
        <ToolbarButton
          label="Bulleted list"
          onClick={() => runEdit((current, start, end) => applyLinePrefix(current, start, end, (line) => `- ${line}`))}
        >
          <List aria-hidden="true" className={toolbarIconClassName} />
        </ToolbarButton>
        <ToolbarButton
          label="Numbered list"
          onClick={() =>
            runEdit((current, start, end) => applyLinePrefix(current, start, end, (line, index) => `${index + 1}. ${line}`))
          }
        >
          <ListOrdered aria-hidden="true" className={toolbarIconClassName} />
        </ToolbarButton>
        <ToolbarButton
          label="Quote"
          onClick={() => runEdit((current, start, end) => applyLinePrefix(current, start, end, (line) => `> ${line}`))}
        >
          <Quote aria-hidden="true" className={toolbarIconClassName} />
        </ToolbarButton>
      </div>

      <textarea
        ref={textareaRef}
        rows={rows}
        maxLength={maxLength}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleUndoRedoKeyDown}
        className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-slate-400"
        placeholder={placeholder}
      />
    </div>
  );
}
