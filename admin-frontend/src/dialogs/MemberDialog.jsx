import { useEffect, useState } from "react";
import { useApp } from "../store/AppContext.jsx";
import Dialog from "../components/Dialog.jsx";
import { todayKey } from "../lib/dates.js";
import { readPhoto } from "../lib/photo.js";
import { PAYMENT_MODES } from "../lib/constants.js";

export default function MemberDialog() {
  const {
    memberDialog,
    closeMemberDialog,
    trainers,
    domain,
    generateGymId,
    saveMember,
    deleteMember,
    showToast,
  } = useApp();
  const member = memberDialog.member;

  const [gymId, setGymId] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [fee, setFee] = useState("");
  const [admissionFee, setAdmissionFee] = useState("");
  const [admissionMode, setAdmissionMode] = useState("cash");
  const [membershipType, setMembershipType] = useState("monthly");
  const [packageMonths, setPackageMonths] = useState("3");
  const [collectionTiming, setCollectionTiming] = useState("at-join");
  const [startDate, setStartDate] = useState(() => todayKey());
  const [trainerId, setTrainerId] = useState("");
  const [photo, setPhoto] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!memberDialog.open) return;
    setGymId(member?.gymId || member?.id || generateGymId());
    setName(member?.name || "");
    setPhone(member?.phone || "");
    setAddress(member?.address || "");
    setFee(member?.fee || "");
    setAdmissionFee(Number(member?.admissionFee || 0) > 0 ? member.admissionFee : "");
    setAdmissionMode(member?.payments?.find((payment) => payment.kind === "admission")?.mode || "cash");
    setMembershipType(domain.getMembershipType(member));
    setPackageMonths(String(domain.getPackageMonths(member)));
    setCollectionTiming(domain.getCollectionTiming(member));
    setStartDate(member?.startDate || todayKey());
    setTrainerId(member?.trainerId || "");
    setPhoto(member?.photo || "");
    setBusy(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberDialog.open, member]);

  const isPackage = membershipType === "package";

  const trainerOptions = trainers
    .slice()
    .sort((a, b) => Number(b.status === "active") - Number(a.status === "active") || a.name.localeCompare(b.name));

  const onPhotoChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setPhoto(await readPhoto(file));
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    const payload = {
      id: member?.id || "",
      gymId: String(gymId || "").trim().toUpperCase() || generateGymId(),
      name: String(name).trim(),
      phone: String(phone).trim(),
      address: String(address).trim(),
      fee: Number(fee),
      admissionFee: Math.max(0, Number(admissionFee) || 0),
      admissionMode: Math.max(0, Number(admissionFee) || 0) > 0 ? admissionMode : "",
      membershipType: membershipType === "package" ? "package" : "monthly",
      packageMonths: Math.max(1, Math.round(Number(packageMonths || 1))),
      collectionTiming: collectionTiming === "fixed-day" ? "fixed-day" : "at-join",
      startDate: String(startDate),
      trainerId: String(trainerId || ""),
      photo,
    };
    try {
      await saveMember(payload);
      closeMemberDialog();
    } catch (error) {
      showToast(error.message);
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async () => {
    if (!member?.id || busy) return;
    if (!confirm("Delete " + (member.name || "this member") + "?")) return;
    setBusy(true);
    try {
      await deleteMember(member.id);
      closeMemberDialog();
    } catch (error) {
      showToast(error.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog className="member-dialog" id="memberDialog" open={memberDialog.open} onClose={closeMemberDialog}>
      <form className="member-form" id="memberForm" method="dialog" onSubmit={onSubmit}>
        <div className="dialog-head">
          <div>
            <p className="eyebrow">Easy onboarding</p>
            <h2 id="dialogTitle">{member ? "Edit member" : "Add new member"}</h2>
          </div>
          <button className="icon-button" id="closeDialog" aria-label="Close" type="button" onClick={closeMemberDialog}>
            ×
          </button>
        </div>

        <div className="photo-field">
          <div className="photo-preview-box">
            <span className="photo-placeholder" aria-hidden="true">
              👤
            </span>
            <img
              id="photoPreview"
              src={photo || ""}
              alt={photo ? "Member photo preview" : ""}
              style={{ visibility: photo ? "visible" : "hidden" }}
            />
          </div>
          <label>
            <span>Take or upload photo</span>
            <input id="photoInput" name="photo" type="file" accept="image/*" onChange={onPhotoChange} />
          </label>
        </div>

        <div className="form-grid">
          <label>
            Gym ID
            <input
              id="gymIdInput"
              name="gymId"
              placeholder="Auto generated"
              value={gymId}
              onChange={(event) => setGymId(event.target.value)}
            />
          </label>
          <label>
            Name
            <input
              id="nameInput"
              name="name"
              required
              autoComplete="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label>
            Mobile number
            <input
              id="phoneInput"
              name="phone"
              required
              inputMode="tel"
              autoComplete="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
            />
          </label>
          <label className="wide">
            Address
            <textarea
              id="addressInput"
              name="address"
              rows="3"
              required
              value={address}
              onChange={(event) => setAddress(event.target.value)}
            />
          </label>
          <fieldset className="membership-options wide">
            <legend>Membership type</legend>
            <label className="membership-option">
              <input
                type="radio"
                name="membershipType"
                value="monthly"
                checked={membershipType === "monthly"}
                onChange={() => setMembershipType("monthly")}
              />
              <span>
                <strong>Monthly membership</strong>
                <small>Bills every month using the gym billing cycle.</small>
              </span>
            </label>
            <label className="membership-option">
              <input
                type="radio"
                name="membershipType"
                value="package"
                checked={membershipType === "package"}
                onChange={() => setMembershipType("package")}
              />
              <span>
                <strong>Package membership</strong>
                <small>Bills again after the selected package period.</small>
              </span>
            </label>
          </fieldset>
          <label>
            Fee amount
            <input
              id="feeInput"
              name="fee"
              type="number"
              min="0"
              step="1"
              required
              inputMode="numeric"
              value={fee}
              onChange={(event) => setFee(event.target.value)}
            />
          </label>
          <label>
            Admission fee
            <input
              id="admissionFeeInput"
              name="admissionFee"
              type="number"
              min="0"
              step="1"
              placeholder="0"
              inputMode="numeric"
              value={admissionFee}
              onChange={(event) => setAdmissionFee(event.target.value)}
            />
            <small className="field-hint">One-time joining charge. Leave blank if the gym doesn't collect one.</small>
          </label>
          <label id="admissionModeField" hidden={!(Number(admissionFee) > 0)}>
            Admission fee payment mode
            <select
              id="admissionModeInput"
              name="admissionMode"
              disabled={!(Number(admissionFee) > 0)}
              value={admissionMode}
              onChange={(event) => setAdmissionMode(event.target.value)}
            >
              {PAYMENT_MODES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label id="packageMonthsField" className="package-months-field" hidden={!isPackage}>
            Package months
            <input
              id="packageMonthsInput"
              name="packageMonths"
              type="number"
              min="1"
              step="1"
              inputMode="numeric"
              disabled={!isPackage}
              required={isPackage}
              value={packageMonths}
              onChange={(event) => setPackageMonths(event.target.value)}
            />
          </label>
          <label>
            Start date
            <input
              id="startDateInput"
              name="startDate"
              type="date"
              required
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
            />
          </label>
          <fieldset className="membership-options wide">
            <legend>Payment collection</legend>
            <label className="membership-option">
              <input
                type="radio"
                name="collectionTiming"
                value="at-join"
                checked={collectionTiming === "at-join"}
                onChange={() => setCollectionTiming("at-join")}
              />
              <span>
                <strong>Collect at join (upfront)</strong>
                <small>Mark the first term paid now. Next payment is due one cycle later.</small>
              </span>
            </label>
            <label className="membership-option">
              <input
                type="radio"
                name="collectionTiming"
                value="fixed-day"
                checked={collectionTiming === "fixed-day"}
                onChange={() => setCollectionTiming("fixed-day")}
              />
              <span>
                <strong>Collect after the period</strong>
                <small>No payment at join. Due at the end of the period.</small>
              </span>
            </label>
          </fieldset>
          <label className="wide">
            Assigned trainer
            <select
              id="assignedTrainerInput"
              name="trainerId"
              value={trainerId}
              onChange={(event) => setTrainerId(event.target.value)}
            >
              <option value="">No trainer assigned</option>
              {trainerOptions.map((trainer) => (
                <option key={trainer.id} value={trainer.id}>
                  {trainer.name} - {trainer.specialty || "Trainer"}
                  {trainer.status === "inactive" ? " (inactive)" : ""}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="form-actions">
          <button
            className={"secondary-action" + (busy ? " is-busy" : "")}
            id="deleteMember"
            type="button"
            style={{ display: member ? "inline-block" : "none" }}
            disabled={busy}
            onClick={onDelete}
          >
            Delete
          </button>
          <button className={"primary-action" + (busy ? " is-busy" : "")} type="submit" disabled={busy}>
            Save member
          </button>
        </div>
      </form>
    </Dialog>
  );
}
