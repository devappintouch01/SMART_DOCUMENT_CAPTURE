"use client";

import { useEffect, useId, useRef, useState } from "react";

export type SelectOption = { value: string; label: string };

type Props = {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  ariaLabel: string;
  disabled?: boolean;
  // lg: the main dropdown of a form; md: filters; sm: inside a table or a row.
  size?: "lg" | "md" | "sm";
  // Fill the width of the container instead of fitting the longest option.
  block?: boolean;
  // Shown when the value matches no option.
  placeholder?: string;
};

const SIZES = {
  lg: "min-h-11 px-3.5 text-base",
  md: "min-h-10 px-3 text-sm",
  sm: "min-h-9 px-2.5 text-sm",
} as const;

// Our own dropdown instead of the browser's <select>: the list of options can
// be styled, and the chevron has a reserved space so it never sits on text.
export function Select({ value, onChange, options, ariaLabel, disabled, size = "md", block, placeholder }: Props) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [up, setUp] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const listId = useId();

  const list = useRef<HTMLUListElement>(null);
  const selectedIndex = options.findIndex((o) => o.value === value);
  const selected = options[selectedIndex];

  // Clicking anywhere else closes the list.
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  // Keep the option chosen with the keyboard in view in a long list.
  useEffect(() => {
    if (!open) return;
    document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [open, active, listId]);

  function openList() {
    if (disabled) return;
    // Open upward when the list would run off the bottom of the window and there
    // is more room above (the page-size dropdown sits at the very bottom).
    const rect = root.current?.getBoundingClientRect();
    if (rect) {
      const needed = Math.min(288, options.length * 40 + 16);
      const below = window.innerHeight - rect.bottom;
      setUp(below < needed && rect.top > below);
    }
    setActive(Math.max(selectedIndex, 0));
    setOpen(true);
  }

  function choose(index: number) {
    const option = options[index];
    if (option) onChange(option.value);
    setOpen(false);
  }

  function onKeyDown(event: React.KeyboardEvent) {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        if (!open) openList();
        else setActive((i) => Math.min(i + 1, options.length - 1));
        break;
      case "ArrowUp":
        event.preventDefault();
        if (!open) openList();
        else setActive((i) => Math.max(i - 1, 0));
        break;
      case "Home":
        if (open) {
          event.preventDefault();
          setActive(0);
        }
        break;
      case "End":
        if (open) {
          event.preventDefault();
          setActive(options.length - 1);
        }
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        if (open) choose(active);
        else openList();
        break;
      case "Escape":
        if (open) {
          event.preventDefault();
          setOpen(false);
        }
        break;
      case "Tab":
        setOpen(false);
        break;
    }
  }

  return (
    <div ref={root} className={`relative ${block ? "block w-full" : "inline-block"}`}>
      <button
        type="button"
        role="combobox"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKeyDown}
        className={`flex w-full items-center justify-between gap-2 rounded-lg border bg-white py-1.5 text-left outline-none transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${SIZES[size]} ${
          open ? "border-primary" : "border-black/15 hover:border-black/30 focus-visible:border-primary"
        }`}
      >
        <span className={`truncate ${selected ? "" : "text-neutral-400"}`}>{selected?.label ?? placeholder ?? ""}</span>
        <svg
          viewBox="0 0 20 20"
          aria-hidden="true"
          className={`h-4 w-4 shrink-0 text-neutral-500 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <path d="M5 7.5l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <ul
          ref={list}
          id={listId}
          role="listbox"
          aria-label={ariaLabel}
          className={`absolute left-0 z-30 max-h-72 min-w-full overflow-auto rounded-xl border border-black/10 bg-white py-1.5 text-sm shadow-lg ${
            up ? "bottom-full mb-1.5" : "mt-1.5"
          }`}
        >
          {options.map((option, index) => {
            const isSelected = option.value === value;
            return (
              <li
                key={option.value}
                role="option"
                aria-selected={isSelected}
                id={`${listId}-${index}`}
                // Moving the mouse picks an option; a pointer that merely rests over
                // the list must not undo what the arrow keys chose.
                onMouseMove={() => active !== index && setActive(index)}
                onMouseDown={(event) => {
                  event.preventDefault();
                  choose(index);
                }}
                className={`mx-1.5 flex cursor-pointer items-center justify-between gap-6 rounded-lg px-3 py-2 whitespace-nowrap ${
                  index === active ? "bg-primary-soft" : ""
                } ${isSelected ? "font-medium text-primary" : ""}`}
              >
                <span>{option.label}</span>
                {isSelected && (
                  <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4.5 10.5l3.5 3.5 7.5-8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
