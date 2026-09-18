import Icon from "./Icon.jsx";

/**
 * Chrome only fires beforeinstallprompt on some phones, and never on iOS — so
 * where there is no prompt to show, the member gets the browser's own route to
 * the same thing rather than no way to install at all.
 */
export default function InstallBanner({ canInstall, onInstall }) {
  if (canInstall) {
    return (
      <button
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-white border border-primary/25 text-primary text-xs font-bold uppercase tracking-wide shadow-sm active:scale-[0.99] transition-all"
        onClick={onInstall}
        type="button"
      >
        <Icon className="text-[17px]" name="install_mobile" />
        Install this app on your phone
      </button>
    );
  }

  return (
    <div className="w-full flex items-start gap-2.5 p-3 rounded-xl bg-white border border-primary/25 shadow-sm">
      <Icon className="text-[17px] text-primary shrink-0 mt-0.5" name="install_mobile" />
      <p className="text-xs text-on-surface-variant leading-relaxed">
        <span className="font-bold text-primary uppercase tracking-wide">Install this app</span>
        <br />
        Open your browser menu and choose “Add to Home screen”. The icon opens your gym straight
        away.
      </p>
    </div>
  );
}
