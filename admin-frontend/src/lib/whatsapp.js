// WhatsApp messages the desk sends a member: a fee reminder and their login.
import { currency, displayDate } from "./dates.js";
import { normalizePhone } from "./format.js";

// wa.me needs the full international number; stored numbers are the bare
// 10-digit local form, so put the Indian country code back for the link.
function toWhatsappNumber(phone) {
  const digits = normalizePhone(phone);
  return digits.length === 10 ? "91" + digits : digits;
}

function openChat(phone, text) {
  window.open(`https://wa.me/${toWhatsappNumber(phone)}?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
}

export function sendFeeReminder(member, domain) {
  if (!domain.getUnpaidPeriods(member).length) return;
  const balance = domain.getBalanceDue(member);
  // Only a part-payment balance is owed: there is no new fee to quote yet.
  if (balance > 0 && !domain.isOverdue(member)) {
    openChat(
      member.phone,
      `Hello ${member.name}, a balance of ${currency(balance)} is pending on your gym fee. Please clear it with your next payment. Thank you.`,
    );
    return;
  }
  openChat(
    member.phone,
    `Hello ${member.name}, your gym fee of ${currency(member.fee)} is due on ${displayDate(
      domain.getDueDateKey(member),
    )}${balance > 0 ? `, along with a pending balance of ${currency(balance)}` : ""}. Please clear it soon. Thank you.`,
  );
}

// The member portal is served from this same host, at /checkin/<gym-slug>.
export function sendLoginDetails(member, { gymName, gymSlug }) {
  const name = gymName || "our gym";
  const loginUrl = gymSlug ? `${window.location.origin}/checkin/${gymSlug}` : window.location.origin;
  openChat(
    member.phone,
    `Hello ${member.name},\n\n` +
      `Welcome to ${name}! Your member login is ready.\n\n` +
      `*Login details*\n` +
      `Membership ID: ${member.gymId}\n` +
      `Mobile Number: ${member.phone}\n` +
      `Login link: ${loginUrl}\n\n` +
      `Sign in with your Membership ID and registered mobile number to view your attendance, payments and dues.\n\n` +
      `Please keep these details confidential and do not share them with anyone.\n\n` +
      `Regards,\n${name}`,
  );
}
