import { useCallback, useEffect, useState } from "react";
import { fetchCheckinHistory, postCheckin } from "../lib/api.js";
import { clearSavedId, readSavedId, writeSavedId } from "../lib/gym.js";

const EMPTY = { member: null, history: [], status: "Ready" };

/** Owns the check-in round trip: the remembered id, the API call, and what to show after. */
export default function useCheckin(slug) {
  const [savedId, setSavedId] = useState(() => readSavedId(slug));
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [profile, setProfile] = useState(EMPTY);

  // Switching gyms (a scanned QR) swaps in that gym's remembered id.
  useEffect(() => {
    setSavedId(readSavedId(slug));
    setProfile(EMPTY);
    setResult(null);
  }, [slug]);

  // Show the remembered member's history straight away, before they check in.
  useEffect(() => {
    if (!slug || !savedId) return undefined;
    let active = true;
    fetchCheckinHistory(slug, savedId)
      .then((data) => {
        if (active) setProfile({ member: data.member, history: data.history || [], status: "Ready" });
      })
      .catch(() => {
        // Keep the check-in screen usable when history cannot load.
      });
    return () => {
      active = false;
    };
  }, [slug, savedId]);

  const checkIn = useCallback(
    async (identifier, code) => {
      if (!slug) return;
      setBusy(true);
      setResult(null);
      try {
        const data = await postCheckin(slug, identifier, code);
        const name = data.member?.name || "Member";

        if (data.denied) {
          // The gym blocks expired memberships: no attendance was recorded.
          setProfile({ member: data.member, history: data.history || [], status: "Membership expired" });
          setResult({
            tone: "err",
            message: data.error || "Membership expired — access denied. Please renew at the front desk.",
          });
          return;
        }

        writeSavedId(slug, identifier);
        setSavedId(identifier);

        if (data.expired) {
          setProfile({ member: data.member, history: data.history || [], status: "Checked in — expired" });
          setResult({
            tone: "warn",
            message: `${name}, your membership has expired — please renew at the front desk. ${
              data.duplicate ? "Already checked in today." : "Check-in recorded."
            }`,
          });
          return;
        }

        setProfile({ member: data.member, history: data.history || [], status: "Checked in" });
        setResult({
          tone: "ok",
          message: data.duplicate
            ? `Already checked in today, ${name}.`
            : `Welcome, ${name}. Attendance logged for ${data.member?.gymId || "your membership"}.`,
        });
      } catch (error) {
        setProfile((current) => ({ ...current, status: "Not checked in" }));
        setResult({ tone: "err", message: error.message });
      } finally {
        setBusy(false);
      }
    },
    [slug],
  );

  const forget = useCallback(() => {
    clearSavedId(slug);
    setSavedId("");
    setProfile(EMPTY);
    setResult({ tone: "ok", message: "Saved ID removed from this phone." });
  }, [slug]);

  return { busy, checkIn, forget, profile, result, savedId };
}
