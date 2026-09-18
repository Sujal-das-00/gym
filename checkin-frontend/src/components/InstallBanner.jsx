import { useState } from "react";
import Icon from "./Icon.jsx";

const STEPS = {
  ios: ["Tap the Share button at the bottom of Safari.", "Choose “Add to Home Screen”, then “Add”."],
  android: ["Tap the ⋮ menu at the top right of Chrome.", "Choose “Add to Home screen” or “Install app”."],
  desktop: ["Open the browser menu, or the install icon in the address bar.", "Choose “Install”."],
  // http:// isn't a secure context, so the browser will only make a bookmark that
  // opens in a tab — the real app needs the https:// address.
  insecure: [
    "This page is open over an insecure http:// address.",
    "Open your gym's https:// link — scan the front desk QR again — then install.",
  ],
};

/**
 * Always a button, never just advice: Chrome fires beforeinstallprompt on only
 * some phones and never on iOS, so where there is no prompt to hand the tap opens
 * the steps for that browser instead of the member finding nothing to press.
 */
export default function InstallBanner({ gymName, onInstall, platform = "desktop", secure = true }) {
  const [steps, setSteps] = useState(null);

  const handleClick = async () => {
    const accepted = await onInstall();
    // No prompt was available (or it was dismissed) — show how to do it by hand.
    if (!accepted) setSteps(secure ? STEPS[platform] || STEPS.desktop : STEPS.insecure);
  };

  return (
    <div className="w-full rounded-xl bg-white border border-primary/25 shadow-sm overflow-hidden">
      <button
        className="w-full flex items-center justify-center gap-2 py-2.5 px-3 text-primary text-xs font-bold uppercase tracking-wide active:scale-[0.99] transition-all"
        onClick={handleClick}
        type="button"
      >
        <Icon className="text-[17px]" name="install_mobile" />
        {gymName ? `Install ${gymName} on your phone` : "Install this app on your phone"}
      </button>

      {steps && (
        <div className="px-3 pb-3 pt-1 border-t border-primary/15">
          <p className="text-xs text-on-surface-variant leading-relaxed">
            Add it from your browser menu — the icon then opens your gym straight away.
          </p>
          <ol className="mt-1.5 space-y-1 text-xs text-on-surface-variant list-decimal list-inside">
            {steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
