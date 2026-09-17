import { useEffect, useRef, useState } from "react";

const isInstalled = () =>
  window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;

/** The beforeinstallprompt handling that used to live inline in index.html. */
export default function useInstallPrompt() {
  const promptEvent = useRef(null);
  const [canInstall, setCanInstall] = useState(false);

  useEffect(() => {
    const onBeforeInstallPrompt = (event) => {
      event.preventDefault();
      promptEvent.current = event;
      if (!isInstalled()) setCanInstall(true);
    };
    const onInstalled = () => {
      promptEvent.current = null;
      setCanInstall(false);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const promptInstall = async () => {
    if (!promptEvent.current) return;
    promptEvent.current.prompt();
    await promptEvent.current.userChoice;
    promptEvent.current = null;
    setCanInstall(false);
  };

  return { canInstall, promptInstall };
}
