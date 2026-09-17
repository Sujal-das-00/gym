import { useCallback, useEffect, useState } from "react";
import BrandHeader from "./components/BrandHeader.jsx";
import DashboardHeader from "./components/DashboardHeader.jsx";
import InstallBanner from "./components/InstallBanner.jsx";
import MemberNav from "./components/MemberNav.jsx";
import MissingGymNotice from "./components/MissingGymNotice.jsx";
import QrScannerCard from "./components/QrScannerCard.jsx";
import StatusNote from "./components/StatusNote.jsx";
import TabSwitcher from "./components/TabSwitcher.jsx";
import useCheckin from "./hooks/useCheckin.js";
import useGymBranding from "./hooks/useGymBranding.js";
import useInstallPrompt from "./hooks/useInstallPrompt.js";
import useMemberAccount from "./hooks/useMemberAccount.js";
import usePushNotifications from "./hooks/usePushNotifications.js";
import { readCodeFromLocation, readScan, readScreenFromLocation, readSlugFromLocation } from "./lib/gym.js";
import AccountPanel from "./views/AccountPanel.jsx";
import CheckinPanel from "./views/CheckinPanel.jsx";
import MemberHome from "./views/MemberHome.jsx";
import MemberIdCard from "./views/MemberIdCard.jsx";
import MemberReceipts from "./views/MemberReceipts.jsx";

const PAGE_TITLES = {
  home: "Dashboard",
  checkin: "Check-in",
  receipts: "Receipts",
  "id-card": "ID Card",
};

export default function App() {
  const [slug, setSlug] = useState(readSlugFromLocation);
  const [tab, setTab] = useState("checkin");
  // Seeded from ?screen= so a tapped push notification lands on the screen it
  // promised — a fee reminder opens the dashboard with the dues card on it.
  const [destination, setDestination] = useState(readScreenFromLocation);
  const [scanNote, setScanNote] = useState(null);
  // Today's front-desk code, either scanned off the QR or carried in the ?c= of
  // the link it points at. It only pre-fills the field; the member still submits.
  const [scannedCode, setScannedCode] = useState(readCodeFromLocation);
  const { branding } = useGymBranding(slug);
  // The gym name goes into the install prompt, so the installed icon is the
  // member's own gym rather than a generic "Gym Check-in".
  const { canInstall, promptInstall } = useInstallPrompt(branding.gymName);
  const checkin = useCheckin(slug);
  const account = useMemberAccount(slug);
  const push = usePushNotifications(slug, account.member?.id || "");

  // Scanning a QR swaps gyms with pushState, so the back button has to put the
  // previous gym back.
  useEffect(() => {
    const onPopState = () => setSlug(readSlugFromLocation());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    document.title = branding.gymName ? `${branding.gymName} check-in` : "Gym Check-in";
  }, [branding.gymName]);

  /**
   * A front-desk QR carries the gym's check-in URL plus today's code, so scanning
   * one both picks the gym — that's how someone who installed the app, or opened
   * the bare /checkin link, gets to their own gym — and fills in the code, leaving
   * the member only their number to type.
   */
  const handleScan = useCallback(
    (value) => {
      const { slug: scanned, code } = readScan(value);
      if (!scanned) {
        setScanNote({
          tone: "err",
          message: "That code isn't a gym check-in QR. Scan the one on the front desk console.",
        });
        return;
      }
      if (scanned !== slug) {
        window.history.pushState({}, "", `/checkin/${encodeURIComponent(scanned)}`);
        setSlug(scanned);
      }
      if (code) setScannedCode(code);
      setScanNote({
        tone: "ok",
        message: code
          ? "Front desk recognised — today's code filled in. Enter your number to check in."
          : "Front desk recognised. Enter your number and today's code to check in.",
      });
    },
    [slug],
  );

  // Leaving the home screen lands back on the sign-in tab, not the check-in one,
  // so signing out doesn't read as being thrown to a different part of the app.
  const endSession = account.signOut;
  const signOut = useCallback(() => {
    endSession();
    setDestination("home");
    setTab("account");
  }, [endSession]);

  // Signed in: the member app proper, with its own header and bottom nav.
  if (slug && account.member) {
    return (
      <>
        <DashboardHeader
          expired={account.billing?.expired}
          gymName={branding.gymName}
          logo={branding.logo}
          onSignOut={signOut}
          subtitle={PAGE_TITLES[destination] || "Dashboard"}
        />
        <main className="flex-1 w-full max-w-md mx-auto px-margin pb-6 flex flex-col">
          {destination === "home" && (
            <MemberHome
              billing={account.billing}
              gymName={branding.gymName}
              history={account.history}
              member={account.member}
              push={push}
            />
          )}
          {destination === "receipts" && (
            <MemberReceipts gymName={branding.gymName} member={account.member} />
          )}
          {destination === "id-card" && (
            <MemberIdCard
              billing={account.billing}
              gymName={branding.gymName}
              member={account.member}
            />
          )}
          {destination === "checkin" && (
            <div className="pt-4 flex flex-col space-y-3.5">
              {scanNote && <StatusNote tone={scanNote.tone}>{scanNote.message}</StatusNote>}
              <CheckinPanel checkin={checkin} onScan={handleScan} scannedCode={scannedCode} />
            </div>
          )}
        </main>
        <MemberNav active={destination} onChange={setDestination} />
      </>
    );
  }

  return (
    <main className="flex-1 w-full max-w-md mx-auto px-4 py-4 flex flex-col space-y-4">
      {/* Everything above the switcher is deliberately identical on both tabs, so
          changing tabs reads as the same screen swapping its inputs. */}
      <BrandHeader gymName={branding.gymName} logo={branding.logo} />

      {slug ? (
        <>
          <TabSwitcher active={tab} onChange={setTab} />
          {tab === "checkin" ? (
            <>
              {scanNote && <StatusNote tone={scanNote.tone}>{scanNote.message}</StatusNote>}
              <CheckinPanel checkin={checkin} onScan={handleScan} scannedCode={scannedCode} />
            </>
          ) : (
            <AccountPanel busy={account.busy} error={account.error} onUnlock={account.signIn} />
          )}
        </>
      ) : (
        <div className="flex flex-col space-y-3.5">
          <MissingGymNotice />
          {scanNote && <StatusNote tone={scanNote.tone}>{scanNote.message}</StatusNote>}
          <QrScannerCard onScan={handleScan} />
        </div>
      )}

      {canInstall && (
        <div className="pt-1">
          <InstallBanner onInstall={promptInstall} />
        </div>
      )}
    </main>
  );
}
