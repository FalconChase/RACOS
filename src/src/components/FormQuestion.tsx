import type { ReactNode } from "react";

interface FormQuestionProps {
  label: string;
  children: ReactNode;
  hint?: ReactNode;
  // Tighter padding/label size for forms meant to fit on one screen (e.g.
  // BookingsScreen's New rental) without scrolling — everywhere else keeps
  // the roomier default Google Forms look.
  compact?: boolean;
}

// A single "question" card — the Google Forms pattern of one field (or one
// tightly related group of fields) per boxed section, stacked vertically,
// rather than a dense multi-column grid.
export default function FormQuestion({ label, children, hint, compact = false }: FormQuestionProps) {
  return (
    <div
      className={compact ? "rounded-lg p-3" : "rounded-lg p-5"}
      style={{ background: "var(--surface-1)", border: "0.5px solid var(--border)" }}
    >
      <label
        className={compact ? "mb-2 block text-sm font-medium" : "mb-3 block text-base font-medium"}
        style={{ color: "var(--text-primary)" }}
      >
        {label}
      </label>
      {children}
      {hint && (
        <div className={compact ? "mt-1.5 text-xs" : "mt-2.5 text-sm"} style={{ color: "var(--text-muted)" }}>
          {hint}
        </div>
      )}
    </div>
  );
}
