import Icon from "./Icon.jsx";

export default function InstallBanner({ onInstall }) {
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
