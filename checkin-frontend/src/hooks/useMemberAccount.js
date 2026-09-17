import { useCallback, useEffect, useState } from "react";
import { fetchAccountSession, postAccountLogin, postAccountLogout } from "../lib/api.js";

const SIGNED_OUT = { member: null, history: [], billing: null };

/**
 * Real member sign-in: gym_id (membership code) as the username, phone as the
 * password. A successful login sets an httpOnly member session cookie on the
 * backend; this hook restores that session silently on mount/slug-change so a
 * returning member doesn't have to sign in again every visit.
 */
export default function useMemberAccount(slug) {
  const [account, setAccount] = useState(SIGNED_OUT);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Scanning a different gym's QR must not leave the previous gym's member open,
  // and must not carry that gym's session into this one.
  useEffect(() => {
    setAccount(SIGNED_OUT);
    setError("");
    if (!slug) return undefined;
    let active = true;
    fetchAccountSession(slug)
      .then((data) => {
        if (active) setAccount({ member: data.member, history: data.history || [], billing: data.billing || null });
      })
      .catch(() => {
        // No valid session for this gym — stay on the sign-in screen.
      });
    return () => {
      active = false;
    };
  }, [slug]);

  const signIn = useCallback(
    async (gymId, phone, trustDevice) => {
      if (!slug) return;
      setBusy(true);
      setError("");
      try {
        const data = await postAccountLogin(slug, { gymId, phone, trustDevice });
        setAccount({
          member: data.member,
          history: data.history || [],
          billing: data.billing || null,
        });
      } catch (problem) {
        setError(problem.message);
      } finally {
        setBusy(false);
      }
    },
    [slug],
  );

  const signOut = useCallback(() => {
    setAccount(SIGNED_OUT);
    setError("");
    if (slug) postAccountLogout(slug);
  }, [slug]);

  return { ...account, busy, error, signIn, signOut };
}
