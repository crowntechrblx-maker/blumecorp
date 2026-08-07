import { useEffect, useRef, useState, type KeyboardEvent } from "react";

export interface CustomSelectOption {
  value: string;
  label: string;
  tone?: "red" | "white";
}

export function CustomSelect({
  value,
  options,
  onChange,
  className = "",
}: {
  value: string;
  options: CustomSelectOption[];
  onChange: (value: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const selectedIndex = Math.max(
    0,
    options.findIndex((o) => o.value === value)
  );
  const selected = options[selectedIndex];

  function openList() {
    setHighlight(selectedIndex);
    setOpen(true);
  }

  function pick(index: number) {
    const opt = options[index];
    if (!opt) return;
    onChange(opt.value);
    setOpen(false);
  }

  function onKeyDown(e: KeyboardEvent) {
    if (!open) {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        openList();
      }
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(options.length - 1, h + 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(0, h - 1));
      return;
    }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      pick(highlight);
    }
  }

  return (
    <div className={`blume-custom-select ${className}`} ref={rootRef}>
      <button
        type="button"
        className={`blume-custom-select-trigger${open ? " blume-custom-select-open" : ""}`}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKeyDown}
      >
        <span
          className={`blume-custom-select-value${
            selected?.tone === "red" ? " blume-group-red" : ""
          }`}
        >
          {selected?.label || ""}
        </span>
        <span className="blume-custom-select-arrow">▾</span>
      </button>
      {open && (
        <ul className="blume-custom-select-list" role="listbox">
          {options.map((opt, i) => (
            <li
              key={opt.value}
              role="option"
              aria-selected={opt.value === value}
              className={`blume-custom-select-option${
                i === highlight ? " blume-custom-select-highlight" : ""
              }${opt.value === value ? " blume-custom-select-selected" : ""}${
                opt.tone === "red" ? " blume-group-red" : ""
              }`}
              onMouseEnter={() => setHighlight(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(i)}
            >
              {opt.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
