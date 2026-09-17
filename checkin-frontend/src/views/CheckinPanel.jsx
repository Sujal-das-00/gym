import MemberPanel from "../components/MemberPanel.jsx";
import PhoneCheckinCard from "../components/PhoneCheckinCard.jsx";
import QrScannerCard from "../components/QrScannerCard.jsx";

export default function CheckinPanel({ checkin, disabled, onScan, scannedCode }) {
  const { busy, checkIn, forget, profile, result, savedId } = checkin;

  return (
    <div
      aria-labelledby="tab-checkin"
      className="flex flex-col space-y-3.5 animate-panel-in"
      id="panel-checkin"
      role="tabpanel"
    >
      <QrScannerCard onScan={onScan} />
      <PhoneCheckinCard
        busy={busy}
        disabled={disabled}
        initialCode={scannedCode}
        initialValue={savedId}
        onSubmit={checkIn}
        result={result}
      />
      {profile.member && (
        <MemberPanel
          history={profile.history}
          member={profile.member}
          onForget={forget}
          status={profile.status}
        />
      )}
    </div>
  );
}
