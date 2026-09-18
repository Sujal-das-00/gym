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
import {
  clearLastGym,
  readCodeFromLocation,
  readLastGym,
  readScan,
  readScreenFromLocation,
  readSlugFromLocation,
  wantsGymPicker,
  writeLastGym,
} from "./lib/gym.js";
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
  /**
   * The gym to open on launch, read once before first paint.
   *
   * The installed app and the APK are the same build for every gym, so they open
   * the bare /checkin with no gym in the URL. Whichever gym the member scanned
   * into last was remembered, and this sends them straight back there. The "not
   * your gym?" link (/checkin?pick=1) is what skips it.
   */
  const [savedGym] = useState(() =>
    readSlugFromLocation() || wantsGymPicker() ? "" : readLastGym(),
  );
  const [tab, setTab] = useState("checkin");
  // Seeded from ?screen= so a tapped push notification lands on the screen it
  // promised — a fee reminder opens the dashboard with the dues card on it.
  const [destination, setDestination] = useState(readScreenFromLocation);
  const [scanNote, setScanNote] = useState(null);
  // Today's front-desk code, either scanned off the QR or carried in the ?c= of
  // the link it points at. It only pre-fills the field; the member still submits.
  const [scannedCode, setScannedCode] = useState(readCodeFromLocation);
  const { branding, found } = useGymBranding(slug);
  const { installed, platform, promptInstall, secure } = useInstallPrompt(slug);
  // The server says this gym doesn't exist (it closed, or the QR is stale), so the
  // app offers the scanner instead of a check-in page that can only fail.
  const gymMissing = Boolean(slug) && found === false;
  // Nothing to install for a gym that doesn't exist — that screen is the scanner.
  const install = slug && !installed && !gymMissing
    ? { gymName: branding.gymName, onInstall: promptInstall, platform, secure }
    : null;
  const checkin = useCheckin(slug);
  const account = useMemberAccount(slug);
  const push = usePushNotifications(slug, account.member?.id || "");

  // A push notification (or anything else that steers the open tab) can change the
  // gym in the address bar without a reload, so keep the app on whatever /checkin
  // slug the URL says — including when the back button restores an earlier one.
  useEffect(() => {
    const onPopState = () => setSlug(readSlugFromLocation());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    document.title = branding.gymName ? `${branding.gymName} check-in` : "Gym Check-in";
  }, [branding.gymName]);

  // Remember the gym only once the server has confirmed it, and forget it the
  // moment it stops existing — otherwise a closed gym would send every later
  // launch to a dead page with no way back to the scanner. An offline load leaves
  // the remembered gym alone (found is null, not false).
  useEffect(() => {
    if (!slug) return;
    if (found === true) writeLastGym(slug);
    if (found === false) clearLastGym();
  }, [found, slug]);

  // replace(), not assign(): the bare /checkin the app launched on shouldn't sit
  // in history for the back button to bounce off.
  useEffect(() => {
    if (savedGym) window.location.replace(`/checkin/${encodeURIComponent(savedGym)}`);
  }, [savedGym]);

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
      // A different gym is a real navigation, not a pushState: the browser reads
      // <link rel="manifest"> as the page loads, so a gym swapped in after boot
      // would still install the manifest — and the start_url — of the old one.
      if (scanned !== slug) {
        const query = code ? `?c=${encodeURIComponent(code)}` : "";
        window.location.assign(`/checkin/${encodeURIComponent(scanned)}${query}`);
        return;
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

  // The launch redirect above is already running — a spinner-free holding screen
  // beats a flash of the "choose your gym" scanner the member is about to skip.
  if (savedGym) {
    return (
      <main className="flex-1 flex flex-col items-center justify-center gap-2 px-6 text-center">
        <BrandHeader gymName="" logo="" />
        <p className="text-xs text-on-surface-variant">Opening your gym…</p>
      </main>
    );
  }

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
              install={install}
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

      {install && <InstallBanner {...install} />}

      {slug && !gymMissing ? (
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
          <a
            className="text-[11px] text-on-surface-variant underline text-center py-1"
            href="/checkin?pick=1"
          >
            Not your gym? Scan another front-desk QR
          </a>
        </>
      ) : (
        <div className="flex flex-col space-y-3.5">
          <MissingGymNotice reason={gymMissing ? "unknown" : "missing"} />
          {scanNote && <StatusNote tone={scanNote.tone}>{scanNote.message}</StatusNote>}
          <QrScannerCard onScan={handleScan} />
        </div>
      )}
    </main>
  );
}
