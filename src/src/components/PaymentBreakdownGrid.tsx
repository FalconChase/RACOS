import type { BookingPaymentEntryType } from "../lib/types";

// One extra row beyond the fixed Payment/Fee/Others rows below — picks its
// own type (Advance payment has no fixed row of its own).
export interface ExtraPaymentRow {
  type: BookingPaymentEntryType;
  amount: string;
  note: string;
}

interface PaymentBreakdownGridProps {
  paymentAmount: string;
  setPaymentAmount: (v: string) => void;
  paymentAmountValid: boolean;
  notYetPaid: boolean;
  setNotYetPaid: (v: boolean) => void;
  feeAmount: string;
  setFeeAmount: (v: string) => void;
  feeNote: string;
  setFeeNote: (v: string) => void;
  othersAmount: string;
  setOthersAmount: (v: string) => void;
  othersNote: string;
  setOthersNote: (v: string) => void;
  extraRows: ExtraPaymentRow[];
  setExtraRows: (updater: (prev: ExtraPaymentRow[]) => ExtraPaymentRow[]) => void;
}

const TYPE_LABELS: Record<BookingPaymentEntryType, string> = {
  fee: "Fee",
  advance_payment: "Advance payment",
  other: "Other",
};

function toNumber(s: string): number {
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function formatTotal(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
}

const thStyle: React.CSSProperties = {
  border: "0.5px solid var(--border)",
  color: "var(--text-muted)",
};
const tdStyle: React.CSSProperties = {
  border: "0.5px solid var(--border)",
};
const cellInputStyle: React.CSSProperties = {
  background: "transparent",
  border: "none",
  color: "var(--text-primary)",
  width: "100%",
};

// Excel-style grid for the New rental wizard's Payment step — a single
// visual table, but the PAYMENT row is purely a redisplay of the existing
// required paymentAmount/notYetPaid fields (same validation as before, just
// repositioned into this row); FEE and OTHERS are fixed always-shown rows
// (saved only if filled); "+" appends more rows with their own type picker
// (e.g. Advance payment); TOTAL is a pure on-screen sum of what's in the
// Amount column — never written anywhere, never fed into Expected/
// Settlements/Remittances/Outstanding.
export default function PaymentBreakdownGrid({
  paymentAmount,
  setPaymentAmount,
  paymentAmountValid,
  notYetPaid,
  setNotYetPaid,
  feeAmount,
  setFeeAmount,
  feeNote,
  setFeeNote,
  othersAmount,
  setOthersAmount,
  othersNote,
  setOthersNote,
  extraRows,
  setExtraRows,
}: PaymentBreakdownGridProps) {
  function addRow() {
    setExtraRows((prev) => [...prev, { type: "advance_payment", amount: "", note: "" }]);
  }

  function updateRow(i: number, patch: Partial<ExtraPaymentRow>) {
    setExtraRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  function removeRow(i: number) {
    setExtraRows((prev) => prev.filter((_, idx) => idx !== i));
  }

  const total =
    toNumber(paymentAmount) + toNumber(feeAmount) + toNumber(othersAmount) + extraRows.reduce((sum, r) => sum + toNumber(r.amount), 0);

  return (
    <div>
      <table className="w-full border-collapse text-sm" style={{ borderColor: "var(--border)" }}>
        <thead>
          <tr>
            <th className="p-2 text-left text-xs font-semibold uppercase" style={thStyle}>Type</th>
            <th className="p-2 text-left text-xs font-semibold uppercase" style={thStyle}>Amount</th>
            <th className="p-2 text-left text-xs font-semibold uppercase" style={thStyle}>Note</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="p-2 font-medium" style={{ ...tdStyle, color: "var(--text-primary)" }}>Payment</td>
            <td className="p-1" style={tdStyle}>
              <input
                type="number"
                min={0}
                className="px-2 py-1.5 text-sm"
                style={cellInputStyle}
                placeholder={notYetPaid ? "Amount agreed *" : "Amount collected *"}
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
              />
            </td>
            <td className="p-2" style={tdStyle}>
              <label className="flex items-center gap-1.5 text-xs whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5"
                  checked={notYetPaid}
                  onChange={(e) => setNotYetPaid(e.target.checked)}
                />
                AR (not yet paid)
              </label>
            </td>
          </tr>
          {!paymentAmountValid && (
            <tr>
              <td colSpan={3} className="px-2 pb-1.5 text-xs" style={{ color: "var(--text-danger)" }}>
                {notYetPaid ? "Enter the amount agreed with the customer." : "Enter the amount collected."}
              </td>
            </tr>
          )}

          <tr>
            <td className="p-2 font-medium" style={{ ...tdStyle, color: "var(--text-primary)" }}>Fee</td>
            <td className="p-1" style={tdStyle}>
              <input
                type="number"
                min={0}
                className="px-2 py-1.5 text-sm"
                style={cellInputStyle}
                placeholder="Amount (optional)"
                value={feeAmount}
                onChange={(e) => setFeeAmount(e.target.value)}
              />
            </td>
            <td className="p-1" style={tdStyle}>
              <input
                className="px-2 py-1.5 text-sm"
                style={cellInputStyle}
                placeholder="Note (optional)"
                value={feeNote}
                onChange={(e) => setFeeNote(e.target.value)}
              />
            </td>
          </tr>

          <tr>
            <td className="p-2 font-medium" style={{ ...tdStyle, color: "var(--text-primary)" }}>Others</td>
            <td className="p-1" style={tdStyle}>
              <input
                type="number"
                min={0}
                className="px-2 py-1.5 text-sm"
                style={cellInputStyle}
                placeholder="Amount (optional)"
                value={othersAmount}
                onChange={(e) => setOthersAmount(e.target.value)}
              />
            </td>
            <td className="p-1" style={tdStyle}>
              <input
                className="px-2 py-1.5 text-sm"
                style={cellInputStyle}
                placeholder="Note / please specify (optional)"
                value={othersNote}
                onChange={(e) => setOthersNote(e.target.value)}
              />
            </td>
          </tr>

          {extraRows.map((row, i) => (
            <tr key={i}>
              <td className="p-1" style={tdStyle}>
                <select
                  className="px-1 py-1.5 text-sm"
                  style={{ ...cellInputStyle, color: "var(--text-primary)" }}
                  value={row.type}
                  onChange={(e) => updateRow(i, { type: e.target.value as BookingPaymentEntryType })}
                >
                  <option value="fee">{TYPE_LABELS.fee}</option>
                  <option value="advance_payment">{TYPE_LABELS.advance_payment}</option>
                  <option value="other">{TYPE_LABELS.other}</option>
                </select>
              </td>
              <td className="p-1" style={tdStyle}>
                <input
                  type="number"
                  min={0}
                  className="px-2 py-1.5 text-sm"
                  style={cellInputStyle}
                  placeholder="Amount (optional)"
                  value={row.amount}
                  onChange={(e) => updateRow(i, { amount: e.target.value })}
                />
              </td>
              <td className="relative p-1" style={tdStyle}>
                <input
                  className="px-2 py-1.5 pr-6 text-sm"
                  style={cellInputStyle}
                  placeholder="Note (optional)"
                  value={row.note}
                  onChange={(e) => updateRow(i, { note: e.target.value })}
                />
                <button
                  type="button"
                  onClick={() => removeRow(i)}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-sm font-medium"
                  style={{ color: "var(--text-danger)" }}
                  title="Remove row"
                >
                  ×
                </button>
              </td>
            </tr>
          ))}

          <tr>
            <td colSpan={3} className="p-2" style={tdStyle}>
              <button type="button" onClick={addRow} className="text-sm font-medium" style={{ color: "var(--text-accent)" }}>
                + Add row
              </button>
            </td>
          </tr>

          <tr>
            <td className="p-2 font-semibold" style={{ ...tdStyle, color: "var(--text-primary)" }}>Total</td>
            <td className="p-2 font-semibold" style={{ ...tdStyle, color: "var(--text-primary)" }}>{formatTotal(total)}</td>
            <td className="p-2" style={tdStyle} />
          </tr>
        </tbody>
      </table>
      <p className="mt-1.5 text-xs" style={{ color: "var(--text-muted)" }}>
        Fee/Others/extra rows and Total are a staff reference only — they never affect Expected, Settlements, Remittances, or Outstanding.
      </p>
    </div>
  );
}
