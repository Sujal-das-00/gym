import { useEffect, useMemo, useRef, useState } from "react";
import { useApp, useDialogs } from "../store/AppContext.jsx";
import Dialog from "../components/Dialog.jsx";
import FieldError from "../components/FieldError.jsx";
import PhoneField from "../components/PhoneField.jsx";
import Icon from "../components/Icon.jsx";
import OptionCards, { billingTermOptions } from "../components/OptionCards.jsx";
import { currency, displayDate, localDateKey, todayKey } from "../lib/dates.js";
import { collectionTimingLabel, planLabel } from "../lib/billing.js";
import { blankHistory, historyProblem, joiningDateProblem, onboardingPayload } from "../lib/onboarding.js";
import ExistingMemberHistory, { ExistingMemberReview } from "../components/ExistingMemberHistory.jsx";
import StepProgress from "../components/StepProgress.jsx";
import ReviewCard from "../components/ReviewCard.jsx";
import { readPhoto } from "../lib/photo.js";
import { PAYMENT_MODES } from "../lib/constants.js";
import { firstErrorField, toPhoneDigits, validateMember } from "../lib/validation.js";

// Quick picks for a package length; any 1-60 months can still be typed.
const PACKAGE_PRESETS = [3, 6, 12];

// Order the fields appear in the form, so the first invalid one is the one we
// focus after a failed submit.
const FIELD_ORDER = ["name", "phone", "gymId", "address", "packageMonths", "fee", "startDate", "collectionTiming", "admissionFee", "admissionMode"];

// Adding a member is a few short screens ending in a review, so nothing is
// saved before the admin has seen what they entered. An existing member asks
// for one kind of thing per screen; a new member's details fit on one.
const EXISTING_STEPS = [
  { title: "Member details", fields: ["name", "phone", "gymId", "address"] },
  { title: "Membership", fields: ["packageMonths", "fee", "startDate"] },
  { title: "Payment details", fields: ["collectionTiming"] },
  { title: "Review", fields: [] },
];
const NEW_STEPS = [
  { title: "Member details", fields: ["name", "phone", "gymId", "address", "packageMonths", "fee", "startDate", "collectionTiming", "admissionFee", "admissionMode"] },
  { title: "Review", fields: [] },
];

const FIELD_IDS = {
  gymId: "gymIdInput",
  name: "nameInput",
  phone: "phoneInput",
  address: "addressInput",
  fee: "feeInput",
  admissionFee: "admissionFeeInput",
  packageMonths: "packageMonthsInput",
  startDate: "startDateInput",
  collectionTiming: "collectionTimingInput",
  admissionMode: "admissionModeInput",
};

export default function MemberDialog() {
  const { closeMemberDialog } = useApp();
  const { memberDialog } = useDialogs();
  // Keyed per member, so the form starts from that member's values on its very
  // first render — no empty frame followed by a second render to fill it in.
  return (
    <Dialog className="sheet member-form-sheet" id="memberDialog" open={memberDialog.open} onClose={closeMemberDialog}>
      {memberDialog.member ? (
        <MemberForm key={memberDialog.member.id} member={memberDialog.member} />
      ) : (
        <AddMemberFlow />
      )}
    </Dialog>
  );
}

// Adding starts by asking who this is: someone joining now, or a member who
// joined before being entered into GymBoo (who comes with past payments).
// The dialog unmounts its content when closed, so every Add starts here.
function AddMemberFlow() {
  const { closeMemberDialog } = useApp();
  const [kind, setKind] = useState("");
  if (kind) return <MemberForm member={null} kind={kind} onBack={() => setKind("")} />;
  return (
    <div className="sheet-panel">
      <header className="sheet-head">
        <span className="sheet-grabber" aria-hidden="true" />
        <h2 id="dialogTitle">Who are you adding?</h2>
        <button className="sheet-close" id="closeDialog" aria-label="Close" type="button" onClick={closeMemberDialog}>
          <Icon name="close" />
        </button>
      </header>
      <div className="sheet-body">
        <div className="member-kind">
          <button type="button" className="member-kind-option" id="addNewMember" onClick={() => setKind("new")}>
            <Icon name="person_add" />
            <span>
              <strong>New member</strong>
              <small>Someone joining the gym now.</small>
            </span>
            <Icon name="chevron_right" className="member-kind-go" />
          </button>
          <button type="button" className="member-kind-option" id="addExistingMember" onClick={() => setKind("existing")}>
            <Icon name="history" />
            <span>
              <strong>Existing member</strong>
              <small>Already a member before being added to GymBoo. You&apos;ll enter their past payments.</small>
            </span>
            <Icon name="chevron_right" className="member-kind-go" />
          </button>
        </div>
      </div>
    </div>
  );
}

function MemberForm({ member, kind = "new", onBack }) {
  const {
    closeMemberDialog,
    members,
    trainers,
    domain,
    generateGymId,
    saveMember,
    deleteMember,
    showToast,
    openPlanDialog,
  } = useApp();
  // While editing, the plan is read from the live list: a change made in the
  // plan sheet on top of this form shows here straight away.
  const liveMember = member ? members.find((item) => item.id === member.id) || member : null;

  const [gymId, setGymId] = useState(() => member?.gymId || member?.id || generateGymId());
  const [name, setName] = useState(member?.name || "");
  const [phone, setPhone] = useState(() => toPhoneDigits(member?.phone));
  const [address, setAddress] = useState(member?.address || "");
  const [fee, setFee] = useState(member?.fee || "");
  const [admissionFee, setAdmissionFee] = useState(Number(member?.admissionFee || 0) > 0 ? member.admissionFee : "");
  const [admissionMode, setAdmissionMode] = useState(
    () => member?.payments?.find((payment) => payment.kind === "admission")?.mode || (member ? "cash" : ""),
  );
  const [membershipType, setMembershipType] = useState(() => domain.getMembershipType(member));
  const [packageMonths, setPackageMonths] = useState(() => String(domain.getPackageMonths(member)));
  // Someone being added has to be given billing terms: neither is chosen for them.
  const [collectionTiming, setCollectionTiming] = useState(() => (member ? domain.getCollectionTiming(member) : null));
  const isExisting = !member && kind === "existing";
  // Someone joining now can start today or later, never on an earlier day.
  const isNew = !member && !isExisting;
  // An existing member's original joining date has to be typed: defaulting it
  // to today would make them a new member.
  const [startDate, setStartDate] = useState(member?.startDate || (isExisting ? "" : todayKey()));
  const [history, setHistory] = useState(blankHistory);
  const [trainerId, setTrainerId] = useState(member?.trainerId || "");
  const [photo, setPhoto] = useState(member?.photo || "");
  const [busy, setBusy] = useState(false);
  // A field only shows its error once it has been left or the form submitted —
  // errors while still typing the first character read as nagging.
  const [touched, setTouched] = useState({});
  const [formError, setFormError] = useState("");
  const formRef = useRef(null);
  const bodyRef = useRef(null);
  const [step, setStep] = useState(0);
  // Set once Next is tried on the past-payments screen, so unanswered items are marked there.
  const [historyChecked, setHistoryChecked] = useState(false);


  const isPackage = membershipType === "package";
  // Once recorded, the admission fee has its own payment row, corrected from
  // Edit payments; the profile only adds one that was never recorded.
  const recordedAdmission = liveMember?.payments?.find((payment) => payment.kind === "admission") || null;

  const otherMembers = useMemo(() => (members || []).filter((item) => item.id !== member?.id), [members, member?.id]);
  const errors = validateMember(
    { gymId, name, phone, address, fee, admissionFee, membershipType, packageMonths, startDate, minStartDate: isNew ? todayKey() : "" },
    otherMembers,
  );
  // An existing member's plan isn't edited here (see the Change plan sheet).
  if (member) {
    delete errors.fee;
    delete errors.packageMonths;
  }
  if (isExisting) {
    // Their admission fee is entered with the past payments instead.
    delete errors.admissionFee;
    const joining = joiningDateProblem(startDate);
    if (joining) errors.startDate = joining;
  }
  if (!member && !collectionTiming) errors.collectionTiming = "Select the billing terms.";
  if (isNew && Number(admissionFee) > 0 && !admissionMode) errors.admissionMode = "Select how the admission fee was paid.";
  const errorCount = Object.keys(errors).length;

  // The member-to-be, so the past terms come from the gym's own billing engine
  // (30-day terms, calendar months or packages, whatever this plan uses).
  const draft = useMemo(
    () => ({
      startDate,
      fee: Number(fee) || 0,
      membershipType: membershipType === "package" ? "package" : "monthly",
      packageMonths: Math.max(1, Math.round(Number(packageMonths || 1))),
      collectionTiming: collectionTiming === "fixed-day" ? "fixed-day" : "at-join",
      planStartDate: "",
      billingCutover: "",
      payments: [],
    }),
    [startDate, fee, membershipType, packageMonths, collectionTiming],
  );
  const terms = isExisting && collectionTiming && !joiningDateProblem(startDate) ? domain.getBillablePeriodKeys(draft) : [];
  const historyError = isExisting ? historyProblem({ startDate, terms, history, domain, member: draft }) : "";

  // A message from an earlier save attempt describes the form as it was then:
  // once the history changes (switching to "After the period" drops the term
  // that was being asked about) it no longer applies.
  useEffect(() => setFormError(""), [historyError]);

  // What the Review screen shows for someone joining now.
  const trainerName = trainers.find((trainer) => trainer.id === trainerId)?.name || "";
  const admissionAmount = Math.max(0, Number(admissionFee) || 0);
  const upfront = collectionTiming === "at-join";
  const receivedNow = isNew ? (upfront ? Number(fee) || 0 : 0) + admissionAmount : 0;
  const unitWord = membershipType === "package" ? "package" : "month";
  let nextDueNote = "";
  let newMemberRows = [];
  if (isNew && startDate) {
    // The first term's key, as the server names it when the member is added.
    const firstKey = membershipType === "package" || domain.settings?.billingCycleMode !== "month-start" ? startDate : startDate.slice(0, 7);
    const firstEnd = domain.periodEndDate(draft, firstKey);
    const nextDue = Number.isNaN(firstEnd.getTime()) ? "" : displayDate(localDateKey(firstEnd));
    nextDueNote = nextDue
      ? upfront
        ? `The first ${unitWord} payment is marked paid now. The next payment is due ${nextDue}.`
        : `Nothing is collected now. The first ${unitWord} payment is due ${nextDue}, when the ${unitWord} ends.`
      : "";
    newMemberRows = [
      { label: "Member", value: name.trim(), hint: toPhoneDigits(phone) },
      { label: "Gym ID", value: String(gymId || "").trim().toUpperCase() },
      { label: "Plan", value: domain.getMembershipLabel(draft), hint: `${currency(Number(fee) || 0)} · ${collectionTimingLabel(collectionTiming)}` },
      { label: "Starts", value: displayDate(startDate) },
      { label: "Trainer", value: trainerName || "No trainer" },
      ...(upfront ? [{ label: `First ${unitWord} payment`, value: currency(Number(fee) || 0), hint: "Paid now" }] : []),
      ...(admissionAmount > 0
        ? [{ label: "Admission fee", value: currency(admissionAmount), hint: PAYMENT_MODES.find((option) => option.value === admissionMode)?.label || "" }]
        : []),
    ];
  }

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

  const steps = isExisting ? EXISTING_STEPS : isNew ? NEW_STEPS : null;
  const lastStep = steps ? steps.length - 1 : 0;
  // A new member's sections all sit on the first screen; an existing member's
  // each get their own. Editing shows everything. The last screen is the review.
  const at = (index) => !steps || (step < lastStep && step === (isExisting ? index : 0));
  const goToStep = (index) => {
    setStep(index);
    setFormError("");
    bodyRef.current?.scrollTo?.({ top: 0 });
  };
  // Every blocking problem shows in two places: inline above the buttons and as a toast.
  const showError = (message) => {
    setFormError(message);
    showToast(message);
  };
  const goNext = () => {
    const stepErrors = steps[step].fields.filter((field) => errors[field]);
    if (stepErrors.length) {
      setTouched((current) => ({ ...current, ...Object.fromEntries(stepErrors.map((field) => [field, true])) }));
      const field = firstErrorField(errors, stepErrors);
      showError(stepErrors.length === 1 ? errors[field] : `${errors[field]} (${stepErrors.length} fields to fix)`);
      formRef.current?.querySelector("#" + FIELD_IDS[field])?.focus();
      return;
    }
    // An existing member's past payments are checked on their own screen, not only at the end.
    if (isExisting && step === 2 && historyError) {
      setHistoryChecked(true);
      showError(historyError);
      return;
    }
    goToStep(step + 1);
  };
  const onBackClick = () => (step > 0 ? goToStep(step - 1) : onBack?.());

  const onSubmit = async (event) => {
    event.preventDefault();
    if (busy) return;
    // Enter in a field moves on to the next screen instead of saving early.
    if (steps && step < lastStep) return goNext();

    if (errorCount) {
      setTouched(Object.fromEntries(FIELD_ORDER.map((field) => [field, true])));
      const field = firstErrorField(errors, FIELD_ORDER);
      showError(errorCount === 1 ? errors[field] : `${errors[field]} (${errorCount} fields to fix)`);
      formRef.current?.querySelector("#" + FIELD_IDS[field])?.focus();
      return;
    }
    if (historyError) {
      setHistoryChecked(true);
      showError(historyError);
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
      fee: liveMember ? Number(liveMember.fee) : Number(fee),
      admissionFee: recordedAdmission ? Number(recordedAdmission.amount) : Math.max(0, Number(admissionFee) || 0),
      admissionMode: recordedAdmission ? recordedAdmission.mode || "" : Math.max(0, Number(admissionFee) || 0) > 0 ? admissionMode : "",
      // Ignored by the server for an existing member; sent as they stand.
      membershipType: liveMember ? liveMember.membershipType : membershipType === "package" ? "package" : "monthly",
      packageMonths: liveMember ? liveMember.packageMonths : Math.max(1, Math.round(Number(packageMonths || 1))),
      collectionTiming: liveMember ? liveMember.collectionTiming : collectionTiming === "fixed-day" ? "fixed-day" : "at-join",
      startDate: String(startDate),
      trainerId: String(trainerId || ""),
      photo,
    };
    if (isExisting) {
      payload.admissionFee = history.admission.paid ? Number(history.admission.amount) || 0 : 0;
      payload.admissionMode = history.admission.paid ? history.admission.mode : "";
      payload.onboarding = onboardingPayload({ terms, history, fee: Number(fee) || 0 });
    }
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
          {onBack ? (
            <button className="sheet-back" type="button" aria-label={step > 0 ? "Previous step" : "Back to member type"} onClick={onBackClick}>
              <Icon name="arrow_back" />
            </button>
          ) : null}
          <h2 id="dialogTitle">{member ? "Edit member" : isExisting ? "Add existing member" : "Add member"}</h2>
          <button className="sheet-close" id="closeDialog" aria-label="Close" type="button" onClick={closeMemberDialog}>
            <Icon name="close" />
          </button>
        </header>

        {steps ? <StepProgress steps={steps.map((item) => item.title)} current={step} /> : null}

        <div className="sheet-body" ref={bodyRef}>
          {at(0) ? (
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
          ) : null}

          {at(0) ? (
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
                  readOnly={Boolean(member)}
                  onChange={(event) => setGymId(event.target.value)}
                  {...fieldProps("gymId")}
                />
                <FieldError id="gymIdInput-error" message={errorFor("gymId")} />
                {member ? <small className="field-hint">Fixed once assigned.</small> : null}
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
          ) : null}

          {at(1) ? (
          <section className="sheet-section">
            <div className="sheet-section-head">
              <h3>{isExisting ? "Membership" : "Plan"}</h3>
            </div>
            <div className="mf-grid">
              {liveMember ? (
                <div className="mf-field wide">
                  <div className="plan-current">
                    <span className="plan-current-ico" aria-hidden="true">
                      <Icon name="card_membership" />
                    </span>
                    <div>
                      <strong>
                        {planLabel(liveMember)} · {currency(liveMember.fee)}
                      </strong>
                      <small>
                        {collectionTimingLabel(domain.getCollectionTiming(liveMember))}
                        {liveMember.planStartDate ? " · since " + displayDate(liveMember.planStartDate) : ""}
                      </small>
                    </div>
                    <button type="button" className="plan-change-btn" onClick={() => openPlanDialog(liveMember.id)}>
                      <Icon name="swap_horiz" />
                      Change plan
                    </button>
                  </div>
                  <small className="field-hint">Plan changes are dated, logged and keep past payments as they were.</small>
                </div>
              ) : null}
              {liveMember ? null : (
              <>
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
              </>
              )}
              <label className="mf-field">
                {member ? "Joining date" : isExisting ? "Original joining date" : "Start date"}
                <input
                  id="startDateInput"
                  name="startDate"
                  type="date"
                  min={isNew ? todayKey() : undefined}
                  max={isExisting ? todayKey() : undefined}
                  value={startDate}
                  onChange={(event) => setStartDate(event.target.value)}
                  {...fieldProps("startDate")}
                />
                <FieldError id="startDateInput-error" message={errorFor("startDate")} />
                {isExisting ? (
                  <small className="field-hint">When they first joined the gym, not today.</small>
                ) : isNew ? (
                  <small className="field-hint">Today or a later date.</small>
                ) : null}
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
          ) : null}

          {at(2) ? (
          <section className="sheet-section">
            <div className="sheet-section-head">
              <h3>{isExisting ? "Payment setup" : "Payment"}</h3>
            </div>
            <div className="mf-grid">
              {member ? null : (
              <div className="mf-field wide">
                <span className="mf-label" id="collectionTimingLabel">
                  Set the billing terms
                </span>
                <OptionCards
                  name="collectionTiming"
                  label="Billing terms"
                  value={collectionTiming}
                  onChange={(value) => {
                    setCollectionTiming(value);
                    markTouched("collectionTiming");
                  }}
                  options={billingTermOptions(unitWord)}
                  invalid={Boolean(errorFor("collectionTiming"))}
                  firstId="collectionTimingInput"
                />
                <FieldError id="collectionTimingInput-error" message={errorFor("collectionTiming")} />
              </div>
              )}

              {isExisting ? null : recordedAdmission ? (
              <div className="mf-field wide">
                <span className="mf-label">Admission fee</span>
                <div className="mf-locked">
                  <Icon name="lock" />
                  <span>
                    <strong>{currency(recordedAdmission.amount)}</strong>
                    <small>
                      Recorded{recordedAdmission.dateKnown === false ? "" : ` on ${displayDate(String(recordedAdmission.date).slice(0, 10))}`}. Correct it from Edit payments.
                    </small>
                  </span>
                </div>
              </div>
              ) : (
              <>
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
                    {PAYMENT_MODES.map((option, index) => (
                      <button
                        key={option.value}
                        id={index === 0 ? "admissionModeInput" : undefined}
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
                  <FieldError id="admissionModeInput-error" message={errorFor("admissionMode")} />
                </div>
              ) : null}
              </>
              )}
            </div>
          </section>
          ) : null}

          {isExisting && step === 2 && collectionTiming ? (
            <ExistingMemberHistory member={draft} terms={terms} history={history} onChange={setHistory} domain={domain} showErrors={historyChecked} />
          ) : null}

          {isExisting && step === lastStep ? (
            <ExistingMemberReview member={draft} terms={terms} history={history} domain={domain} person={{ name: name.trim(), phone: toPhoneDigits(phone), trainer: trainerName }} />
          ) : null}

          {isNew && step === lastStep ? (
            <ReviewCard
              title="Review before adding"
              subtitle="Check everything, then add the member."
              rows={newMemberRows}
              total={{ label: "Received at joining", value: currency(receivedNow) }}
              notes={[nextDueNote]}
            />
          ) : null}

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
          {steps && step > 0 ? (
            <button className="sheet-secondary" type="button" disabled={busy} onClick={() => goToStep(step - 1)}>
              Back
            </button>
          ) : null}
          {steps && step < lastStep ? (
            // A key of its own: the same button must not turn into the submit button mid-click.
            <button key="next" className="sheet-confirm" type="button" onClick={goNext}>
              Next step
            </button>
          ) : (
            <button key="save" className={"sheet-confirm" + (busy ? " is-busy" : "")} type="submit" disabled={busy}>
              {busy ? "Saving..." : member ? "Save changes" : isExisting ? "Add existing member" : "Add member"}
            </button>
          )}
        </footer>
      </form>
  );
}
