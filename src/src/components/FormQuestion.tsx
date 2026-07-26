import type { ReactNode } from "react";

interface FormQuestionProps {
  label: string;
  children: ReactNode;
  hint?: ReactNode;
}

// A single "question" card — the Google Forms pattern of one field (or one
// tightly related group of fields) per boxed section, stacked vertically,
// rather than a dense multi-column grid.
export default function FormQuestion({ label, children, hint }: FormQuestionProps) {
  return (
    <div
      className="rounded-lg p-5"
      style={{ background: "var(--surface-1)", border: "0.5px solid var(--border)" }}
    >
      <label className="mb-3 block text-base font-medium" style={{ color: "var(--text-primary)" }}>
        {label}
      </label>
      {children}
      {hint && (
        <div className="mt-2.5 text-sm" style={{ color: "var(--text-muted)" }}>
          {hint}
        </div>
      )}
    </div>
  );
}
