import { displayDate, displayPeriod } from "./format.js";
import { rupees } from "./memberStats.js";

const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character],
  );

const MODE_LABELS = {
  cash: "Cash",
  upi: "UPI",
  card: "Card",
  bank: "Bank transfer",
  cheque: "Cheque",
  other: "Other",
};

// Blank for payments recorded before the mode was captured — the row is dropped
// rather than shown as an empty or invented value.
export const paymentMode = (payment) => MODE_LABELS[payment?.mode] || "";

export const paymentTitle = (payment) =>
  payment.kind === "admission"
    ? "One-time admission fee"
    : `Membership${displayPeriod(payment.billingPeriod) ? ` • ${displayPeriod(payment.billingPeriod)}` : ""}`;

/**
 * The invoice for one payment: what was paid, when, what for, and by whom.
 *
 * Limited to fields the payment row actually stores — mode of payment has no
 * column in `payments`, so it is absent rather than guessed. This is the printed
 * page itself, with no on-screen chrome: it is never shown, only printed.
 */
export function invoiceHtml({ gymName, member, payment, title }) {
  const paidOn = displayDate(payment.date);

  const mode = paymentMode(payment);

  const field = (label, value, align = "") =>
    `<div class="${align}"><span class="field-label">${escapeHtml(label)}</span><span class="field-value">${escapeHtml(value)}</span></div>`;

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
  @page { margin: 16mm; }
  *, *::before, *::after { box-sizing: border-box; }
  body { margin: 0; background: #fff; color: #1e293b;
         font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
         -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  #sheet { display: flex; flex-direction: column; gap: 16px; }

  .brand { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
  .brand h2 { font-size: 20px; font-weight: 700; color: #0f172a; margin: 0; letter-spacing: -.01em; }
  .brand .word { font-size: 24px; font-weight: 900; color: #f86a10; letter-spacing: .04em; margin: 0; white-space: nowrap; }

  .card { border: 1px solid #e2e8f0; border-radius: 12px; background: #fff; }
  .bill-to { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; padding: 14px; }
  .field-label { display: block; font-size: 10px; font-weight: 700; letter-spacing: .06em; color: #64748b; text-transform: uppercase; }
  .field-value { display: block; font-size: 14px; font-weight: 600; color: #0f172a; margin-top: 3px; word-break: break-word; }
  .right { text-align: right; }

  .card-head { padding: 12px 16px; border-bottom: 1px solid #e2e8f0; }
  .card-head h3 { font-size: 11px; font-weight: 700; color: #475569; letter-spacing: .06em; text-transform: uppercase; margin: 0; }
  .row { display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: 12px 16px; font-size: 14px; }
  .row.bordered { border-top: 1px solid #f1f5f9; }
  .row-label { color: #475569; font-weight: 500; }
  .row-value { color: #0f172a; font-weight: 600; text-align: right; }

  .total { display: flex; justify-content: space-between; align-items: center; gap: 12px;
           border: 2px solid #bbf7d0; background: #f0fdf4; border-radius: 12px; padding: 16px; }
  .total span:first-child { font-size: 14px; font-weight: 700; color: #047857; }
  .total span:last-child { font-size: 22px; font-weight: 700; color: #047857; }

  footer.note { padding-top: 12px; border-top: 1px solid #f1f5f9; text-align: center; font-size: 10px; color: #94a3b8; font-weight: 500; }
</style></head>
<body>
  <article id="sheet">
    <section class="brand">
      <h2>${escapeHtml(gymName)}</h2>
      <h2 class="word">INVOICE</h2>
    </section>

    <section class="card bill-to">
      ${field("Bill to", member.name)}
      ${field("Gym ID", member.gymId)}
      ${field("Paid on", paidOn, "right")}
    </section>

    <section class="card">
      <div class="card-head"><h3>Payment details</h3></div>
      <div class="row">
        <span class="row-label">Paid for</span>
        <span class="row-value">${escapeHtml(paymentTitle(payment))}</span>
      </div>
      ${
        mode
          ? `<div class="row bordered"><span class="row-label">Mode of payment</span><span class="row-value">${escapeHtml(mode)}</span></div>`
          : ""
      }
    </section>

    <section class="total">
      <span>Amount paid</span><span>${escapeHtml(rupees(payment.amount))}</span>
    </section>

    <footer class="note">
      Computer-generated invoice for a payment collected at the front desk and recorded by ${escapeHtml(gymName)}.
      Not a tax invoice.
    </footer>
  </article>
</body></html>`;
}

/**
 * Sends the invoice straight to the print dialog, where "Save as PDF" produces
 * the file. Printing is the only way to get a PDF here without either a PDF
 * library or a server endpoint, and there is neither.
 *
 * Rendered in a hidden iframe so nothing opens on screen first — no tab, and no
 * intermediate file on disk. The document title becomes the suggested PDF
 * filename, which is why it is set to the invoice's name.
 */
export function downloadInvoice({ gymName, member, payment }) {
  const title = `invoice-${member.gymId}-${payment.date}`;
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;";
  document.body.appendChild(frame);

  const view = frame.contentWindow;
  view.document.open();
  view.document.write(invoiceHtml({ gymName, member, payment, title }));
  view.document.close();

  // Removing the frame while the dialog is still open cancels the print, so wait
  // for afterprint where it fires and fall back to a timer where it doesn't.
  const cleanUp = () => frame.remove();
  view.addEventListener("afterprint", cleanUp, { once: true });
  window.setTimeout(cleanUp, 60000);

  view.focus();
  view.print();
}
