import { useState } from "react";

interface ConfirmDialogProps {
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  // If set, the confirm button stays disabled until the user types this
  // exact text into the field below — an extra speed bump for the most
  // destructive actions (factory reset).
  requireTypedConfirmation?: string;
  busy?: boolean;
}

// A real modal popup for destructive confirmations — used instead of an
// inline "are you sure?" line whenever an action can't be undone (deleting
// all bookings, or a full factory reset). Click-outside and Cancel both
// dismiss without side effects.
export default function ConfirmDialog({
  title,
  description,
  confirmLabel,
  onConfirm,
  onCancel,
  requireTypedConfirmation,
  busy,
}: ConfirmDialogProps) {
  const [typed, setTyped] = useState("");
  const locked = Boolean(requireTypedConfirmation) && typed !== requireTypedConfirmation;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0, 0, 0, 0.6)" }}
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-lg p-5"
        style={{ background: "var(--surface-1)", border: "0.5px solid var(--border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>{title}</h3>
        <div className="mt-2 text-sm" style={{ color: "var(--text-secondary)" }}>{description}</div>

        {requireTypedConfirmation && (
          <div className="mt-3">
            <label className="mb-1.5 block text-sm" style={{ color: "var(--text-secondary)" }}>
              Type{" "}
              <span className="font-mono font-semibold" style={{ color: "var(--text-danger)" }}>
                {requireTypedConfirmation}
              </span>{" "}
              to confirm
            </label>
            <input
              autoFocus
              className="w-full rounded-md px-3 py-2.5 text-base"
              style={{
                border: "0.5px solid var(--border-strong)",
                background: "var(--surface-2)",
                color: "var(--text-primary)",
              }}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
            />
          </div>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-md px-4 py-2 text-base font-medium"
            style={{ color: "var(--text-secondary)" }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={locked || busy}
            className="rounded-md px-4 py-2 text-base font-medium disabled:cursor-not-allowed disabled:opacity-40"
            style={{ background: "var(--bg-danger)", color: "var(--text-danger)" }}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
