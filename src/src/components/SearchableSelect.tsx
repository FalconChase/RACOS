import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

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
//
// The option list is portaled to document.body and positioned with
// getBoundingClientRect rather than a plain `absolute` child — this screen
// used to be laid out inline on the page (where overflowing into normal
// document flow was fine), but now also opens inside a capped-height,
// scrollable popup dialog (BookingsScreen's New rental wizard); an
// `absolute` popup there gets silently clipped by the dialog's own
// `overflow-y-auto` instead of extending past it. Portaling sidesteps that
// regardless of what kind of container this ends up inside.
export default function SearchableSelect({ value, onChange, options, placeholder }: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
  // Also closes on scroll (capture, so it hears a scroll from any
  // ancestor — including the wizard dialog's own scroll container) rather
  // than trying to continuously re-track the anchor's position.
  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: MouseEvent) {
      if (
        rootRef.current &&
        !rootRef.current.contains(e.target as Node) &&
        !(e.target as HTMLElement).closest("[data-searchable-select-popup]")
      ) {
        setOpen(false);
      }
    }
    // Scrolling *inside* the popup's own option list must not close it —
    // only a scroll of some ancestor behind it (which would leave the
    // portaled popup visually stranded, no longer lined up with the input)
    // should. The capture-phase listener sees both, so it has to tell them
    // apart by where the scroll actually originated.
    function handleScroll(e: Event) {
      if ((e.target as HTMLElement | Document)?.nodeType === Node.ELEMENT_NODE) {
        const el = e.target as HTMLElement;
        if (el.closest("[data-searchable-select-popup]")) return;
      }
      setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("scroll", handleScroll, true);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("scroll", handleScroll, true);
    };
  }, [open]);

  function openPicker() {
    const rect = inputRef.current?.getBoundingClientRect();
    if (rect) setPos({ top: rect.bottom, left: rect.left, width: rect.width });
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
        ref={inputRef}
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
      {open &&
        pos &&
        createPortal(
          <div
            data-searchable-select-popup
            className="fixed z-[60] mt-1.5 max-h-64 overflow-y-auto rounded-md p-1"
            style={{
              top: pos.top,
              left: pos.left,
              width: pos.width,
              background: "var(--surface-1)",
              border: "0.5px solid var(--border-strong)",
            }}
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
          </div>,
          document.body,
        )}
    </div>
  );
}
