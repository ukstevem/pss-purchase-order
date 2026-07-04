"use client";

import { useEffect, useRef, useState } from "react";

export type SearchOption = string | { value: string; label: string };

interface SearchSelectProps {
  value: string;
  options: SearchOption[];
  placeholder: string;
  /** Called with the chosen option's value, or "" to clear. */
  onSelect: (value: string) => void;
  /** Width utility for the input (default w-56; pass w-full for forms). */
  className?: string;
}

function normalizeOptions(options: SearchOption[]): { value: string; label: string }[] {
  return options.map((o) => (typeof o === "string" ? { value: o, label: o } : o));
}

/** Lowercase and collapse punctuation to spaces, so "c rob" ≈ "C. Rob…" (9bq.13). */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Type-ahead filter (beads 9bq.12/9bq.13): every typed word must appear
 * somewhere in the punctuation-stripped name — "c rob", "c. rob" and
 * "rob steel" all find "C. Roberts Steel Services Ltd.". Selecting
 * applies the exact value; typing alone never navigates. Enter picks
 * the first match, Escape reverts, × clears.
 */
export function SearchSelect({ value, options, placeholder, onSelect, className = "w-56" }: SearchSelectProps) {
  const opts = normalizeOptions(options);
  const labelFor = (v: string) => opts.find((o) => o.value === v)?.label ?? v;

  const [text, setText] = useState(value ? labelFor(value) : "");
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setText(value ? labelFor(value) : ""), [value]);

  const tokens = normalize(text).split(" ").filter(Boolean);
  const matches = (
    tokens.length
      ? opts.filter((o) => {
          const n = normalize(o.label);
          return tokens.every((t) => n.includes(t));
        })
      : opts
  ).slice(0, 50);

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setText(value ? labelFor(value) : ""); // revert unconfirmed typing
      }
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, options]);

  function choose(v: string) {
    setOpen(false);
    setText(v ? labelFor(v) : "");
    onSelect(v);
  }

  return (
    <div ref={wrapRef} className="relative">
      <input
        type="text"
        value={text}
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && matches.length > 0) {
            e.preventDefault();
            choose(matches[0].value);
          } else if (e.key === "Escape") {
            setOpen(false);
            setText(value ? labelFor(value) : "");
          }
        }}
        className={`${className} rounded-md border border-zinc-300 bg-white px-3 py-1.5 pr-7 text-sm`}
      />
      {value && (
        <button
          type="button"
          aria-label="Clear filter"
          onClick={() => choose("")}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded px-1 text-zinc-400 hover:text-zinc-700"
        >
          ×
        </button>
      )}
      {open && matches.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-64 min-w-72 w-full overflow-y-auto rounded-md border border-zinc-200 bg-white shadow-lg">
          {matches.map((o) => (
            <li key={o.value}>
              <button
                type="button"
                onClick={() => choose(o.value)}
                className="block w-full px-3 py-1.5 text-left text-sm hover:bg-zinc-100"
              >
                {o.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
