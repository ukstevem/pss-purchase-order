"use client";

import { useEffect, useRef, useState } from "react";

interface SearchSelectProps {
  value: string;
  options: string[];
  placeholder: string;
  /** Called with the chosen option, or "" to clear the filter. */
  onSelect: (value: string) => void;
}

/**
 * Type-ahead filter (bead 9bq.12): typing narrows options by
 * case-insensitive substring anywhere in the name — "rob" finds
 * "C Roberts". Selecting applies the exact value; typing alone never
 * navigates. Enter picks the first match, Escape reverts, × clears.
 */
export function SearchSelect({ value, options, placeholder, onSelect }: SearchSelectProps) {
  const [text, setText] = useState(value);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => setText(value), [value]);

  const needle = text.trim().toLowerCase();
  const matches = (
    needle ? options.filter((o) => o.toLowerCase().includes(needle)) : options
  ).slice(0, 50);

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setText(value); // revert unconfirmed typing
      }
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [value]);

  function choose(v: string) {
    setOpen(false);
    setText(v);
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
            choose(matches[0]);
          } else if (e.key === "Escape") {
            setOpen(false);
            setText(value);
          }
        }}
        className="w-56 rounded-md border border-zinc-300 bg-white px-3 py-1.5 pr-7 text-sm"
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
        <ul className="absolute z-20 mt-1 max-h-64 w-72 overflow-y-auto rounded-md border border-zinc-200 bg-white shadow-lg">
          {matches.map((o) => (
            <li key={o}>
              <button
                type="button"
                onClick={() => choose(o)}
                className="block w-full px-3 py-1.5 text-left text-sm hover:bg-zinc-100"
              >
                {o}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
