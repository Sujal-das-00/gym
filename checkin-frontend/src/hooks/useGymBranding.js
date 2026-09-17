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

  useEffect(() => {
    if (!slug) {
      setBranding(FALLBACK);
      setLoaded(true);
      return undefined;
    }
    let active = true;
    setLoaded(false);
    fetchGymSettings(slug)
      .then((settings) => {
        if (!active) return;
        setBranding({
          gymName: settings.gymName || FALLBACK.gymName,
          logo: settings.logo || "",
        });
      })
      .catch(() => {
        // Unknown or offline gym — fall back to the neutral wordmark.
        if (active) setBranding(FALLBACK);
      })
      .finally(() => {
        if (active) setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, [slug]);

  return { branding, loaded };
}
