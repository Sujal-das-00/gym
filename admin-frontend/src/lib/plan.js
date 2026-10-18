// Plan status copy, shared by the desktop badge/banner and the mobile app-bar chip.

/** Which plan the gym is on, at a glance: Free Plan, Monthly Subscription, Lifetime License. */
export function describePlan(access) {
  switch (access.phase) {
    case "licensed":
      return access.licence === "lifetime"
        ? { tone: "lifetime", label: "Lifetime License" }
        : { tone: "monthly", label: "Monthly Subscription" };
    case "trial":
      return { tone: "trial", label: "Free Plan" };
    case "grace":
      return { tone: "grace", label: "Pending Verification" };
    case "suspended":
      return { tone: "expired", label: "Suspended" };
    default:
      return { tone: "expired", label: "Trial Ended" };
  }
}

/**
 * Something the owner should know about their plan, or null when all is well.
 * `text` is the full sentence (banner, tooltip); `short` fits a phone app bar.
 */
export function planNotice(status) {
  if (!status) return null;
  const { access, purchase } = status;
  const pending = Boolean(purchase && purchase.claimedAt);

  if (access.phase === "grace") {
    const until = new Date(access.graceUntil).toLocaleString("en-IN", {
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
    });
    return {
      tone: "warn",
      pending,
      short: `Pending · ${access.graceDaysUsed}/${access.graceDaysMax}`,
      text: `Plan pending verification. Temporary access until ${until} (day ${access.graceDaysUsed} of ${access.graceDaysMax}).`,
    };
  }
  if (access.phase === "trial" && pending) {
    return {
      tone: "info",
      pending,
      short: "Verifying",
      text: "Plan pending verification. We confirm your payment within 24 hours.",
    };
  }
  if (access.phase === "trial") {
    const left = access.daysLeft;
    return {
      tone: left <= 2 ? "warn" : "info",
      pending,
      short: left === 0 ? "Last day" : `${left}d trial`,
      text: left === 0 ? "Your free trial ends today." : `Free trial: ${left} day${left === 1 ? "" : "s"} left.`,
    };
  }
  if (access.phase === "expired" || access.phase === "suspended") {
    const label = access.phase === "suspended" ? "Suspended" : "Expired";
    return { tone: "danger", pending, short: label, text: `Plan ${label.toLowerCase()}.`, banner: false };
  }
  return null;
}
