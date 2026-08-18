import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { isProvinceVisible } from "../lib/islandGroups";
import type { AppSettings, Municipality, Province } from "../lib/types";

interface HybridLocationSearchProps {
  provinces: Province[];
  municipalities: Municipality[];
  settings: AppSettings;
  // Called with both ids on a city/municipality match (province resolved
  // from it), or just the province id (cityId null) on a province-only
  // match — the caller decides what to do with each (e.g. clear the city
  // dropdown too on a province-only pick).
  onSelect: (provinceId: string, cityId: string | null) => void;
  placeholder?: string;
}

interface SearchEntry {
  provinceId: string;
  cityId: string | null;
  label: string; // display label, e.g. "Davao City, Davao del Sur" or "Davao del Sur"
  searchLabel: string; // lowercase, for matching
}

// Every character of `token` found in order within `text`, not necessarily
// adjacent — tolerates a missing/extra letter or two (e.g. "dvao" still
// finds "davao"). Substring matches (the common case) score better (lower)
// than a pure subsequence match, so exact/near-exact typing still sorts
// first.
function tokenScore(text: string, token: string): number | null {
  if (!token) return 0;
  const idx = text.indexOf(token);
  if (idx !== -1) return idx;
  let ti = 0;
  for (const ch of token) {
    const found = text.indexOf(ch, ti);
    if (found === -1) return null;
    ti = found + 1;
  }
  return 1000 + ti;
}

// All query tokens (split on whitespace, so "davao del sur" or "del sur
// davao" both work — order doesn't matter) must match somewhere in the
// label; the sum of their individual scores ranks results.
function matchScore(searchLabel: string, tokens: string[]): number | null {
  let total = 0;
  for (const token of tokens) {
    const s = tokenScore(searchLabel, token);
    if (s === null) return null;
    total += s;
  }
  return total;
}

const MAX_RESULTS = 8;

// A single search box that resolves either a city/municipality or a
// province name — typed in any order, tolerant of typos — into both the
// province and city ids at once. Purely a faster alternate route into the
// same two province-then-city dropdowns this always sits alongside; it
// never replaces them; searches the full PSGC list (not narrowed to
// previously-used places), same universe those dropdowns already draw from.
export default function HybridLocationSearch({
  provinces,
  municipalities,
  settings,
  onSelect,
  placeholder,
}: HybridLocationSearchProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const entries = useMemo<SearchEntry[]>(() => {
    const visibleProvinces = provinces.filter((p) => isProvinceVisible(p, settings));
    const visibleProvinceIds = new Set(visibleProvinces.map((p) => p.id));
    const provinceById = new Map(visibleProvinces.map((p) => [p.id, p]));

    const cityEntries: SearchEntry[] = municipalities
      .filter((m) => visibleProvinceIds.has(m.province_id))
      .map((m) => {
        const province = provinceById.get(m.province_id);
        const label = province ? `${m.name}, ${province.name}` : m.name;
        return { provinceId: m.province_id, cityId: m.id, label, searchLabel: label.toLowerCase() };
      });

    const provinceEntries: SearchEntry[] = visibleProvinces.map((p) => ({
      provinceId: p.id,
      cityId: null,
      label: p.name,
      searchLabel: p.name.toLowerCase(),
    }));

    return [...cityEntries, ...provinceEntries];
  }, [provinces, municipalities, settings]);

  const results = useMemo(() => {
    const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return [];
    const scored = entries
      .map((e) => ({ entry: e, score: matchScore(e.searchLabel, tokens) }))
      .filter((r): r is { entry: SearchEntry; score: number } => r.score !== null);
    scored.sort((a, b) => a.score - b.score);
    return scored.slice(0, MAX_RESULTS).map((r) => r.entry);
  }, [entries, query]);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: MouseEvent) {
      if (
        rootRef.current &&
        !rootRef.current.contains(e.target as Node) &&
        !(e.target as HTMLElement).closest("[data-hybrid-location-popup]")
      ) {
        setOpen(false);
      }
    }
    function handleScroll(e: Event) {
      if ((e.target as HTMLElement | Document)?.nodeType === Node.ELEMENT_NODE) {
        const el = e.target as HTMLElement;
        if (el.closest("[data-hybrid-location-popup]")) return;
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
    setOpen(true);
  }

  function select(entry: SearchEntry) {
    onSelect(entry.provinceId, entry.cityId);
    setQuery("");
    setOpen(false);
  }

  return (
    <div className="relative" ref={rootRef}>
      <input
        ref={inputRef}
        className="w-full rounded-md px-3 py-2 text-sm"
        style={{
          border: "0.5px solid var(--border-strong)",
          background: "var(--surface-2)",
          color: "var(--text-primary)",
        }}
        placeholder={placeholder ?? "Quick search — type a city or province…"}
        value={query}
        onFocus={openPicker}
        onChange={(e) => {
          setQuery(e.target.value);
          if (!open) openPicker();
        }}
      />
      {open &&
        pos &&
        query.trim() &&
        createPortal(
          <div
            data-hybrid-location-popup
            className="fixed z-[60] mt-1.5 max-h-64 overflow-y-auto rounded-md p-1"
            style={{
              top: pos.top,
              left: pos.left,
              width: Math.max(pos.width, 260),
              background: "var(--surface-1)",
              border: "0.5px solid var(--border-strong)",
            }}
          >
            {results.length === 0 ? (
              <div className="px-3 py-2 text-sm" style={{ color: "var(--text-muted)" }}>
                No matches.
              </div>
            ) : (
              results.map((entry) => (
                <button
                  type="button"
                  key={`${entry.provinceId}-${entry.cityId ?? "province"}`}
                  onClick={() => select(entry)}
                  className="flex w-full items-center justify-between rounded px-3 py-2 text-left text-sm"
                  style={{ color: "var(--text-primary)" }}
                >
                  <span>{entry.label}</span>
                  {!entry.cityId && (
                    <span className="text-xs" style={{ color: "var(--text-muted)" }}>Province</span>
                  )}
                </button>
              ))
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}
