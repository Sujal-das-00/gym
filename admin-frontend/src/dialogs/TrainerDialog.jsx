import { useEffect, useMemo, useRef, useState } from "react";
import { useApp, useDialogs } from "../store/AppContext.jsx";
import Dialog from "../components/Dialog.jsx";
import FieldError from "../components/FieldError.jsx";
import PhoneField from "../components/PhoneField.jsx";
import Icon from "../components/Icon.jsx";
import { normalizeTrainer } from "../lib/trainers.js";
import { readPhoto } from "../lib/photo.js";
import { firstErrorField, toPhoneDigits, validateTrainer } from "../lib/validation.js";

const FIELD_ORDER = ["name", "phone", "specialty", "shift", "bio"];

// One-tap shifts; anything else can still be typed.
const SHIFT_PRESETS = ["Morning", "Evening", "Full day"];

const FIELD_IDS = {
  name: "trainerNameInput",
  phone: "trainerPhoneInput",
  specialty: "trainerSpecialtyInput",
  shift: "trainerShiftInput",
  bio: "trainerBioInput",
};

export default function TrainerDialog() {
  const { closeTrainerDialog, trainers, saveTrainer, deleteTrainer, showToast } = useApp();
  const { trainerDialog } = useDialogs();
  const trainer = trainerDialog.trainer;

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [shift, setShift] = useState("");
  const [status, setStatus] = useState("active");
  const [bio, setBio] = useState("");
  const [photo, setPhoto] = useState("");
  const [busy, setBusy] = useState(false);
  // Errors stay hidden until a field is left or the form is submitted.
  const [touched, setTouched] = useState({});
  const [formError, setFormError] = useState("");
  const formRef = useRef(null);

  useEffect(() => {
    if (!trainerDialog.open) return;
    setName(trainer?.name || "");
    setPhone(toPhoneDigits(trainer?.phone));
    setSpecialty(trainer?.specialty || "");
    setShift(trainer?.shift || "");
    setStatus(trainer?.status || "active");
    setBio(trainer?.bio || "");
    setPhoto(trainer?.photo || "");
    setBusy(false);
    setTouched({});
    setFormError("");
  }, [trainerDialog.open, trainer]);

  const otherTrainers = useMemo(
    () => (trainers || []).filter((item) => item.id !== trainer?.id),
    [trainers, trainer?.id],
  );
  const errors = validateTrainer({ name, phone, specialty, shift, bio }, otherTrainers);
  const errorCount = Object.keys(errors).length;

  const markTouched = (field) => setTouched((current) => ({ ...current, [field]: true }));
  const errorFor = (field) => (touched[field] ? errors[field] || "" : "");
  const fieldProps = (field) => ({
    onBlur: () => markTouched(field),
    "aria-invalid": errorFor(field) ? "true" : undefined,
    "aria-describedby": errorFor(field) ? FIELD_IDS[field] + "-error" : undefined,
    className: errorFor(field) ? "has-error" : undefined,
  });

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
    const payload = normalizeTrainer({
      id: trainer?.id || undefined,
      name,
      phone: toPhoneDigits(phone),
      specialty,
      shift,
      status,
      bio,
      photo,
      attendance: trainer?.attendance || [],
      createdAt: trainer?.createdAt,
    });
    try {
      await saveTrainer(payload, Boolean(trainer?.id));
      closeTrainerDialog();
    } catch (error) {
      // Offline, expired session or a rejected photo — keep the form and say why.
      const message = error?.message || "Could not save this trainer. Try again.";
      setFormError(message);
      showToast(message);
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async () => {
    if (!trainer?.id || busy) return;
    if (!confirm("Delete " + (trainer.name || "this trainer") + "?")) return;
    setBusy(true);
    try {
      await deleteTrainer(trainer.id);
      closeTrainerDialog();
    } catch (error) {
      const message = error?.message || "Could not delete this trainer. Try again.";
      setFormError(message);
      showToast(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog className="sheet member-form-sheet" id="trainerDialog" open={trainerDialog.open} onClose={closeTrainerDialog}>
      <form className="sheet-panel" id="trainerForm" method="dialog" noValidate ref={formRef} onSubmit={onSubmit}>
        <header className="sheet-head">
          <span className="sheet-grabber" aria-hidden="true" />
          <h2 id="trainerDialogTitle">{trainer ? "Edit trainer" : "Add trainer"}</h2>
          <button className="sheet-close" id="closeTrainerDialog" aria-label="Close" type="button" onClick={closeTrainerDialog}>
            <Icon name="close" />
          </button>
        </header>

        <div className="sheet-body">
          <section className="sheet-section">
            <div className="mf-photo">
              <label className="mf-avatar">
                {photo ? (
                  <img id="trainerPhotoPreview" src={photo} alt="Trainer photo preview" />
                ) : (
                  <Icon name="person" className="mf-avatar-empty" />
                )}
                <span className="mf-avatar-badge" aria-hidden="true">
                  <Icon name="photo_camera" />
                </span>
                <input
                  id="trainerPhotoInput"
                  name="photo"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  aria-label={photo ? "Change photo" : "Add photo"}
                  onChange={onPhotoChange}
                />
              </label>
              <div>
                <strong>{photo ? "Change photo" : "Add a photo"}</strong>
                <small>Shown in the trainer list so members and staff know who is on shift.</small>
              </div>
            </div>
          </section>

          <section className="sheet-section">
            <div className="sheet-section-head">
              <h3>Trainer details</h3>
            </div>
            <div className="mf-grid">
              <label className="mf-field wide">
                Full name
                <input
                  id="trainerNameInput"
                  name="name"
                  autoComplete="name"
                  maxLength={80}
                  placeholder="e.g. Arjun Mehta"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  {...fieldProps("name")}
                />
                <FieldError id="trainerNameInput-error" message={errorFor("name")} />
              </label>
              <PhoneField
                id="trainerPhoneInput"
                className="mf-field"
                value={phone}
                onChange={setPhone}
                onBlur={() => markTouched("phone")}
                error={errorFor("phone")}
              />
              <label className="mf-field">
                Specialty
                <input
                  id="trainerSpecialtyInput"
                  name="specialty"
                  placeholder="Strength, yoga, cardio"
                  maxLength={60}
                  value={specialty}
                  onChange={(event) => setSpecialty(event.target.value)}
                  {...fieldProps("specialty")}
                />
                <FieldError id="trainerSpecialtyInput-error" message={errorFor("specialty")} />
              </label>
            </div>
          </section>

          <section className="sheet-section">
            <div className="sheet-section-head">
              <h3>Schedule</h3>
            </div>
            <div className="mf-grid">
              <div className="mf-field wide">
                <span className="mf-label">Shift</span>
                <div className="mf-months">
                  {SHIFT_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      className={"pay-mode" + (shift.trim().toLowerCase() === preset.toLowerCase() ? " active" : "")}
                      onClick={() => setShift(preset)}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
                <input
                  id="trainerShiftInput"
                  name="shift"
                  placeholder="Or type one, e.g. 6–10 am"
                  maxLength={60}
                  aria-label="Shift"
                  value={shift}
                  onChange={(event) => setShift(event.target.value)}
                  {...fieldProps("shift")}
                />
                <FieldError id="trainerShiftInput-error" message={errorFor("shift")} />
              </div>
              <div className="mf-field wide">
                <span className="mf-label" id="trainerStatusLabel">
                  Status
                </span>
                <div className="segmented" role="radiogroup" aria-labelledby="trainerStatusLabel">
                  <label>
                    <input
                      id="trainerStatusInput"
                      type="radio"
                      name="status"
                      value="active"
                      checked={status === "active"}
                      onChange={() => setStatus("active")}
                    />
                    <span>Active</span>
                  </label>
                  <label>
                    <input
                      type="radio"
                      name="status"
                      value="inactive"
                      checked={status === "inactive"}
                      onChange={() => setStatus("inactive")}
                    />
                    <span>Inactive</span>
                  </label>
                </div>
                <small className="field-hint">
                  {status === "inactive"
                    ? "Kept on file but moved to the bottom of the trainer list."
                    : "Shown in the trainer list and in member trainer lists."}
                </small>
              </div>
              <label className="mf-field wide">
                <span className="mf-label-row">
                  Notes
                  <em>Optional</em>
                </span>
                <textarea
                  id="trainerBioInput"
                  name="bio"
                  rows="3"
                  maxLength={500}
                  placeholder="Experience, certifications or assigned batches"
                  value={bio}
                  onChange={(event) => setBio(event.target.value)}
                  {...fieldProps("bio")}
                />
                <FieldError id="trainerBioInput-error" message={errorFor("bio")} />
              </label>
            </div>
          </section>

          {formError ? (
            <p className="form-error" role="alert">
              {formError}
            </p>
          ) : null}
        </div>

        <footer className="sheet-foot mf-foot">
          {trainer ? (
            <button
              className={"mf-delete" + (busy ? " is-busy" : "")}
              id="deleteTrainer"
              type="button"
              disabled={busy}
              onClick={onDelete}
              aria-label={`Delete ${trainer.name || "trainer"}`}
            >
              <Icon name="delete" />
            </button>
          ) : null}
          <button className={"sheet-confirm" + (busy ? " is-busy" : "")} type="submit" disabled={busy}>
            {busy ? "Saving..." : trainer ? "Save changes" : "Add trainer"}
          </button>
        </footer>
      </form>
    </Dialog>
  );
}
