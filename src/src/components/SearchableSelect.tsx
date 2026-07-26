import { useEffect, useMemo, useRef, useState } from "react";

export interface SearchableOption {
  value: string;
  label: string;
  sublabel?: string;
}

interface SearchableSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SearchableOption[];
  placeholder?: string;
}

// A filterable dropdown — types to narrow the list rather than relying on the
// native <select>/<datalist>, whose search behavior and styling vary too much
// across webviews (same reasoning as the custom DatePicker/TimePicker).
export default function SearchableSelect({ value, onChange, options, placeholder }: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) => o.label.toLowerCase().includes(q) || o.sublabel?.toLowerCase().includes(q),
    );
  }, [options, query]);

  // Close on an outside click, but — unlike a full-screen click-catching
  // overlay — this never sits in front of the rest of the page, so a click
  // on another button (e.g. a "Save" button elsewhere in the form) both
  // closes this dropdown AND still reaches that button in the same click,
  // instead of the first click being silently swallowed by the overlay.
  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  function openPicker() {
    setQuery("");
    setOpen(true);
  }

  function select(o: SearchableOption) {
    onChange(o.value);
    setQuery("");
    setOpen(false);
  }

  return (
    <div className="relative" ref={rootRef}>
      <input
        className="w-full rounded-md px-3 py-2.5 text-base"
        style={{
          border: "0.5px solid var(--border-strong)",
          background: "var(--surface-2)",
          color: "var(--text-primary)",
        }}
        placeholder={placeholder ?? "Search…"}
        value={open ? query : selected?.label ?? ""}
        onFocus={openPicker}
        onChange={(e) => setQuery(e.target.value)}
      />
      {open && (
        <div
          className="absolute left-0 top-full z-20 mt-1.5 max-h-64 w-full overflow-y-auto rounded-md p-1"
          style={{ background: "var(--surface-1)", border: "0.5px solid var(--border-strong)" }}
        >
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-sm" style={{ color: "var(--text-muted)" }}>
              No matches.
            </div>
          ) : (
            filtered.map((o) => (
              <button
                type="button"
                key={o.value}
                onClick={() => select(o)}
                className="flex w-full items-center justify-between rounded px-3 py-2 text-left text-sm"
                style={{ color: o.value === value ? "var(--text-accent)" : "var(--text-primary)" }}
              >
                <span>{o.label}</span>
                {o.sublabel && <span style={{ color: "var(--text-muted)" }}>{o.sublabel}</span>}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
