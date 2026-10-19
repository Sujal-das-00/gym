import { useMemo, useRef, useState } from "react";
import { useApp, useDialogs } from "../store/AppContext.jsx";
import Dialog from "../components/Dialog.jsx";
import FieldError from "../components/FieldError.jsx";
import PhoneField from "../components/PhoneField.jsx";
import Icon from "../components/Icon.jsx";
import { todayKey } from "../lib/dates.js";
import { readPhoto } from "../lib/photo.js";
import { PAYMENT_MODES } from "../lib/constants.js";
import { firstErrorField, toPhoneDigits, validateMember } from "../lib/validation.js";

// Quick picks for a package length; any 1-60 months can still be typed.
const PACKAGE_PRESETS = [3, 6, 12];

// Order the fields appear in the form, so the first invalid one is the one we
// focus after a failed submit.
const FIELD_ORDER = ["name", "phone", "gymId", "address", "packageMonths", "fee", "startDate", "admissionFee"];

const FIELD_IDS = {
  gymId: "gymIdInput",
  name: "nameInput",
  phone: "phoneInput",
  address: "addressInput",
  fee: "feeInput",
  admissionFee: "admissionFeeInput",
  packageMonths: "packageMonthsInput",
  startDate: "startDateInput",
};

export default function MemberDialog() {
  const { closeMemberDialog } = useApp();
  const { memberDialog } = useDialogs();
  // Keyed per member, so the form starts from that member's values on its very
  // first render — no empty frame followed by a second render to fill it in.
  return (
    <Dialog className="sheet member-form-sheet" id="memberDialog" open={memberDialog.open} onClose={closeMemberDialog}>
      <MemberForm key={memberDialog.member?.id || "new"} member={memberDialog.member} />
    </Dialog>
  );
}

function MemberForm({ member }) {
  const {
    closeMemberDialog,
    members,
    trainers,
    domain,
    generateGymId,
    saveMember,
    deleteMember,
    showToast,
  } = useApp();

  const [gymId, setGymId] = useState(() => member?.gymId || member?.id || generateGymId());
  const [name, setName] = useState(member?.name || "");
  const [phone, setPhone] = useState(() => toPhoneDigits(member?.phone));
  const [address, setAddress] = useState(member?.address || "");
  const [fee, setFee] = useState(member?.fee || "");
  const [admissionFee, setAdmissionFee] = useState(Number(member?.admissionFee || 0) > 0 ? member.admissionFee : "");
  const [admissionMode, setAdmissionMode] = useState(
    () => member?.payments?.find((payment) => payment.kind === "admission")?.mode || "cash",
  );
  const [membershipType, setMembershipType] = useState(() => domain.getMembershipType(member));
  const [packageMonths, setPackageMonths] = useState(() => String(domain.getPackageMonths(member)));
  const [collectionTiming, setCollectionTiming] = useState(() => domain.getCollectionTiming(member));
  const [startDate, setStartDate] = useState(member?.startDate || todayKey());
  const [trainerId, setTrainerId] = useState(member?.trainerId || "");
  const [photo, setPhoto] = useState(member?.photo || "");
  const [busy, setBusy] = useState(false);
  // A field only shows its error once it has been left or the form submitted —
  // errors while still typing the first character read as nagging.
  const [touched, setTouched] = useState({});
  const [formError, setFormError] = useState("");
  const formRef = useRef(null);


  const isPackage = membershipType === "package";

  const otherMembers = useMemo(() => (members || []).filter((item) => item.id !== member?.id), [members, member?.id]);
  const errors = validateMember(
    { gymId, name, phone, address, fee, admissionFee, membershipType, packageMonths, startDate },
    otherMembers,
  );
  const errorCount = Object.keys(errors).length;

  const markTouched = (field) => setTouched((current) => ({ ...current, [field]: true }));
  const errorFor = (field) => (touched[field] ? errors[field] || "" : "");
  const fieldProps = (field) => ({
    onBlur: () => markTouched(field),
    "aria-invalid": errorFor(field) ? "true" : undefined,
    "aria-describedby": errorFor(field) ? FIELD_IDS[field] + "-error" : undefined,
    className: errorFor(field) ? "has-error" : undefined,
  });

  const trainerOptions = trainers
    .slice()
    .sort((a, b) => Number(b.status === "active") - Number(a.status === "active") || a.name.localeCompare(b.name));

  const onPhotoChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setPhoto(await readPhoto(file));
    } catch (error) {
      showToast(error?.message || "Could not read that image. Try another photo.");
      event.target.value = "";
    }
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    if (busy) return;

    if (errorCount) {
      setTouched(Object.fromEntries(FIELD_ORDER.map((field) => [field, true])));
      setFormError(
        errorCount === 1 ? "Fix the highlighted field to save." : "Fix the " + errorCount + " highlighted fields to save.",
      );
      const field = firstErrorField(errors, FIELD_ORDER);
      formRef.current?.querySelector("#" + FIELD_IDS[field])?.focus();
      return;
    }

    setFormError("");
    setBusy(true);
    const payload = {
      id: member?.id || "",
      gymId: String(gymId || "").trim().toUpperCase() || generateGymId(),
      name: String(name).trim(),
      phone: toPhoneDigits(phone),
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
      // The save failed server-side (duplicate, offline, expired session) — keep
      // the dialog open with the typed values and say why above the buttons.
      const message = error?.message || "Could not save this member. Check your connection and try again.";
      setFormError(message);
      showToast(message);
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async () => {
    if (!member?.id || busy) return;
    const who = member.name || "this member";
    if (
      !confirm(
        `Do you want to delete ${who} from the gym?\n\n` +
          "They will be removed from your member list and can no longer check in or log in. " +
          "Their payment and attendance records are kept.",
      )
    )
      return;
    setBusy(true);
    try {
      await deleteMember(member.id);
      closeMemberDialog();
    } catch (error) {
      const message = error?.message || "Could not delete this member. Try again.";
      setFormError(message);
      showToast(message);
    } finally {
      setBusy(false);
    }
  };

  const feeError = errorFor("fee");
  const admissionError = errorFor("admissionFee");

  return (
      <form className="sheet-panel" id="memberForm" method="dialog" noValidate ref={formRef} onSubmit={onSubmit}>
        <header className="sheet-head">
          <span className="sheet-grabber" aria-hidden="true" />
          <h2 id="dialogTitle">{member ? "Edit member" : "Add member"}</h2>
          <button className="sheet-close" id="closeDialog" aria-label="Close" type="button" onClick={closeMemberDialog}>
            <Icon name="close" />
          </button>
        </header>

        <div className="sheet-body">
          <section className="sheet-section">
            <div className="mf-photo">
              <label className="mf-avatar">
                {photo ? (
                  <img id="photoPreview" src={photo} alt="Member photo preview" />
                ) : (
                  <Icon name="person" className="mf-avatar-empty" />
                )}
                <span className="mf-avatar-badge" aria-hidden="true">
                  <Icon name="photo_camera" />
                </span>
                <input
                  id="photoInput"
                  name="photo"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  aria-label={photo ? "Change photo" : "Add photo"}
                  onChange={onPhotoChange}
                />
              </label>
              <div>
                <strong>{photo ? "Change photo" : "Add a photo"}</strong>
                <small>Take one with the camera or pick from the gallery. It helps the desk recognise members.</small>
              </div>
            </div>
          </section>

          <section className="sheet-section">
            <div className="sheet-section-head">
              <h3>Member details</h3>
            </div>
            <div className="mf-grid">
              <label className="mf-field wide">
                Full name
                <input
                  id="nameInput"
                  name="name"
                  autoComplete="name"
                  maxLength={80}
                  placeholder="e.g. Rahul Verma"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  {...fieldProps("name")}
                />
                <FieldError id="nameInput-error" message={errorFor("name")} />
              </label>
              <PhoneField
                id="phoneInput"
                className="mf-field"
                value={phone}
                onChange={setPhone}
                onBlur={() => markTouched("phone")}
                error={errorFor("phone")}
              />
              <label className="mf-field">
                Membership ID
                <input
                  id="gymIdInput"
                  name="gymId"
                  placeholder="Auto generated"
                  maxLength={40}
                  value={gymId}
                  onChange={(event) => setGymId(event.target.value)}
                  {...fieldProps("gymId")}
                />
                <FieldError id="gymIdInput-error" message={errorFor("gymId")} />
              </label>
              <label className="mf-field wide">
                Address
                <textarea
                  id="addressInput"
                  name="address"
                  rows="2"
                  maxLength={200}
                  placeholder="House, street, area"
                  value={address}
                  onChange={(event) => setAddress(event.target.value)}
                  {...fieldProps("address")}
                />
                <FieldError id="addressInput-error" message={errorFor("address")} />
              </label>
            </div>
          </section>

          <section className="sheet-section">
            <div className="sheet-section-head">
              <h3>Plan</h3>
            </div>
            <div className="mf-grid">
              <div className="mf-field wide">
                <span className="mf-label" id="membershipTypeLabel">
                  Membership type
                </span>
                <div className="segmented" role="radiogroup" aria-labelledby="membershipTypeLabel">
                  <label>
                    <input
                      type="radio"
                      name="membershipType"
                      value="monthly"
                      checked={membershipType === "monthly"}
                      onChange={() => setMembershipType("monthly")}
                    />
                    <span>Monthly</span>
                  </label>
                  <label>
                    <input
                      type="radio"
                      name="membershipType"
                      value="package"
                      checked={membershipType === "package"}
                      onChange={() => setMembershipType("package")}
                    />
                    <span>Package</span>
                  </label>
                </div>
                <small className="field-hint">
                  {isPackage
                    ? "Bills again after the package period you choose below."
                    : "Bills every month using the gym's billing cycle."}
                </small>
              </div>

              {isPackage ? (
                <div className="mf-field wide" id="packageMonthsField">
                  <span className="mf-label">Package length</span>
                  <div className="mf-months">
                    {PACKAGE_PRESETS.map((months) => (
                      <button
                        key={months}
                        type="button"
                        className={"pay-mode" + (String(months) === String(packageMonths) ? " active" : "")}
                        onClick={() => setPackageMonths(String(months))}
                      >
                        {months} mo
                      </button>
                    ))}
                    <span className={"affix-input mf-months-custom" + (errorFor("packageMonths") ? " has-error" : "")}>
                      <input
                        id="packageMonthsInput"
                        name="packageMonths"
                        type="number"
                        min="1"
                        max="60"
                        step="1"
                        inputMode="numeric"
                        aria-label="Package months"
                        value={packageMonths}
                        onChange={(event) => setPackageMonths(event.target.value)}
                        onBlur={() => markTouched("packageMonths")}
                        aria-invalid={errorFor("packageMonths") ? "true" : undefined}
                      />
                      <span className="affix">months</span>
                    </span>
                  </div>
                  <FieldError id="packageMonthsInput-error" message={errorFor("packageMonths")} />
                </div>
              ) : null}

              <label className="mf-field">
                {isPackage ? "Package fee" : "Monthly fee"}
                <span className={"affix-input" + (feeError ? " has-error" : "")}>
                  <span className="affix">₹</span>
                  <input
                    id="feeInput"
                    name="fee"
                    type="number"
                    min="0"
                    step="1"
                    inputMode="numeric"
                    placeholder="0"
                    value={fee}
                    onChange={(event) => setFee(event.target.value)}
                    onBlur={() => markTouched("fee")}
                    aria-invalid={feeError ? "true" : undefined}
                    aria-describedby={feeError ? "feeInput-error" : undefined}
                  />
                </span>
                <FieldError id="feeInput-error" message={feeError} />
              </label>
              <label className="mf-field">
                Start date
                <input
                  id="startDateInput"
                  name="startDate"
                  type="date"
                  value={startDate}
                  onChange={(event) => setStartDate(event.target.value)}
                  {...fieldProps("startDate")}
                />
                <FieldError id="startDateInput-error" message={errorFor("startDate")} />
              </label>
              <label className="mf-field wide">
                Trainer
                <select
                  id="assignedTrainerInput"
                  name="trainerId"
                  value={trainerId}
                  onChange={(event) => setTrainerId(event.target.value)}
                >
                  <option value="">No trainer</option>
                  {trainerOptions.map((trainer) => (
                    <option key={trainer.id} value={trainer.id}>
                      {trainer.name} - {trainer.specialty || "Trainer"}
                      {trainer.status === "inactive" ? " (inactive)" : ""}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>

          <section className="sheet-section">
            <div className="sheet-section-head">
              <h3>Payment</h3>
            </div>
            <div className="mf-grid">
              <div className="mf-field wide">
                <span className="mf-label" id="collectionTimingLabel">
                  When is the fee collected?
                </span>
                <div className="segmented" role="radiogroup" aria-labelledby="collectionTimingLabel">
                  <label>
                    <input
                      type="radio"
                      name="collectionTiming"
                      value="at-join"
                      checked={collectionTiming === "at-join"}
                      onChange={() => setCollectionTiming("at-join")}
                    />
                    <span>Upfront</span>
                  </label>
                  <label>
                    <input
                      type="radio"
                      name="collectionTiming"
                      value="fixed-day"
                      checked={collectionTiming === "fixed-day"}
                      onChange={() => setCollectionTiming("fixed-day")}
                    />
                    <span>After the period</span>
                  </label>
                </div>
                <small className="field-hint">
                  {collectionTiming === "fixed-day"
                    ? "No payment at join. The fee is due at the end of each period."
                    : "Mark the first term paid now. The next payment is due one cycle later."}
                </small>
              </div>

              <label className="mf-field wide">
                <span className="mf-label-row">
                  Admission fee
                  <em>Optional</em>
                </span>
                <span className={"affix-input" + (admissionError ? " has-error" : "")}>
                  <span className="affix">₹</span>
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
                    onBlur={() => markTouched("admissionFee")}
                    aria-invalid={admissionError ? "true" : undefined}
                    aria-describedby={admissionError ? "admissionFeeInput-error" : undefined}
                  />
                </span>
                <FieldError id="admissionFeeInput-error" message={admissionError} />
                <small className="field-hint">One-time joining charge. Leave blank if the gym doesn&apos;t collect one.</small>
              </label>

              {Number(admissionFee) > 0 ? (
                <div className="mf-field wide" id="admissionModeField">
                  <span className="mf-label" id="admissionModeLabel">
                    Admission fee paid by
                  </span>
                  <div className="pay-modes" role="radiogroup" aria-labelledby="admissionModeLabel">
                    {PAYMENT_MODES.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={admissionMode === option.value}
                        className={"pay-mode" + (admissionMode === option.value ? " active" : "")}
                        onClick={() => setAdmissionMode(option.value)}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </section>

          {formError ? (
            <p className="form-error" role="alert">
              {formError}
            </p>
          ) : null}
        </div>

        <footer className="sheet-foot mf-foot">
          {member ? (
            <button
              className={"mf-delete" + (busy ? " is-busy" : "")}
              id="deleteMember"
              type="button"
              disabled={busy}
              onClick={onDelete}
              aria-label={`Delete ${member.name || "member"}`}
            >
              <Icon name="delete" />
            </button>
          ) : null}
          <button className={"sheet-confirm" + (busy ? " is-busy" : "")} type="submit" disabled={busy}>
            {busy ? "Saving..." : member ? "Save changes" : "Add member"}
          </button>
        </footer>
      </form>
  );
}
