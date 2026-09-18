import { useEffect, useState } from "react";
import { fetchGymSettings } from "../lib/api.js";

const FALLBACK = { gymName: "Gym Check-in", logo: "" };

/**
 * Loads the gym's public name and logo for the header.
 *
 * The palette deliberately stays the member-app orange for every gym rather than
 * following the gym's saved admin-panel colours — the app is designed around it,
 * and the two are set independently. Only the name and logo vary per gym.
 */
export default function useGymBranding(slug) {
  const [branding, setBranding] = useState(FALLBACK);
  const [loaded, setLoaded] = useState(false);
  // true: this gym exists. false: the server says it doesn't (404 — deleted, or
  // closed). null: not asked yet, or the phone is offline and we can't tell.
  const [found, setFound] = useState(null);

  useEffect(() => {
    if (!slug) {
      setBranding(FALLBACK);
      setFound(null);
      setLoaded(true);
      return undefined;
    }
    let active = true;
    setLoaded(false);
    setFound(null);
    fetchGymSettings(slug)
      .then((settings) => {
        if (!active) return;
        setBranding({
          gymName: settings.gymName || FALLBACK.gymName,
          logo: settings.logo || "",
        });
        setFound(true);
      })
      .catch((error) => {
        // Unknown or offline gym — fall back to the neutral wordmark. Only a 404
        // is proof the gym is gone; anything else leaves the question open.
        if (!active) return;
        setBranding(FALLBACK);
        setFound(error?.status === 404 ? false : null);
      })
      .finally(() => {
        if (active) setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, [slug]);

  return { branding, found, loaded };
}
