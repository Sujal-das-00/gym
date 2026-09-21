import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../store/AppContext.jsx";
import Dialog from "../components/Dialog.jsx";
import FieldError from "../components/FieldError.jsx";
import PhoneField from "../components/PhoneField.jsx";
import { normalizeTrainer } from "../lib/trainers.js";
import { readPhoto } from "../lib/photo.js";
import { firstErrorField, toPhoneDigits, validateTrainer } from "../lib/validation.js";

const FIELD_ORDER = ["name", "phone", "specialty", "shift", "bio"];

const FIELD_IDS = {
  name: "trainerNameInput",
  phone: "trainerPhoneInput",
  specialty: "trainerSpecialtyInput",
  shift: "trainerShiftInput",
  bio: "trainerBioInput",
};

export default function TrainerDialog() {
  const { trainerDialog, closeTrainerDialog, trainers, saveTrainer, deleteTrainer, showToast } = useApp();
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
      // Trainers are stored in localStorage, so a failure here is usually a full
      // or blocked storage quota — worth naming instead of silently closing.
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
    <Dialog className="member-dialog" id="trainerDialog" open={trainerDialog.open} onClose={closeTrainerDialog}>
      <form className="member-form" id="trainerForm" method="dialog" noValidate ref={formRef} onSubmit={onSubmit}>
        <div className="dialog-head">
          <div>
            <p className="eyebrow">Trainer profile</p>
            <h2 id="trainerDialogTitle">{trainer ? "Edit trainer" : "Add trainer"}</h2>
          </div>
          <button className="icon-button" id="closeTrainerDialog" aria-label="Close" type="button" onClick={closeTrainerDialog}>
            ×
          </button>
        </div>

        <div className="photo-field">
          <div className="photo-preview-box">
            <span className="photo-placeholder" aria-hidden="true">
              👤
            </span>
            <img
              id="trainerPhotoPreview"
              src={photo || ""}
              alt={photo ? "Trainer photo preview" : ""}
              style={{ visibility: photo ? "visible" : "hidden" }}
            />
          </div>
          <label>
            <span>Take or upload photo</span>
            <input id="trainerPhotoInput" name="photo" type="file" accept="image/*" onChange={onPhotoChange} />
          </label>
        </div>

        <div className="form-grid">
          <label>
            Name
            <input
              id="trainerNameInput"
              name="name"
              autoComplete="name"
              maxLength={80}
              value={name}
              onChange={(event) => setName(event.target.value)}
              {...fieldProps("name")}
            />
            <FieldError id="trainerNameInput-error" message={errorFor("name")} />
          </label>
          <PhoneField
            id="trainerPhoneInput"
            value={phone}
            onChange={setPhone}
            onBlur={() => markTouched("phone")}
            error={errorFor("phone")}
          />
          <label>
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
          <label>
            Shift
            <input
              id="trainerShiftInput"
              name="shift"
              placeholder="Morning, evening, full day"
              maxLength={60}
              value={shift}
              onChange={(event) => setShift(event.target.value)}
              {...fieldProps("shift")}
            />
            <FieldError id="trainerShiftInput-error" message={errorFor("shift")} />
          </label>
          <label>
            Status
            <select
              id="trainerStatusInput"
              name="status"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </label>
          <label className="wide">
            Notes
            <textarea
              id="trainerBioInput"
              name="bio"
              rows="3"
              maxLength={500}
              placeholder="Experience, certifications, or assigned batches"
              value={bio}
              onChange={(event) => setBio(event.target.value)}
              {...fieldProps("bio")}
            />
            <FieldError id="trainerBioInput-error" message={errorFor("bio")} />
          </label>
        </div>

        {formError ? (
          <p className="form-error" role="alert">
            {formError}
          </p>
        ) : null}

        <div className="form-actions">
          <button
            className={"secondary-action" + (busy ? " is-busy" : "")}
            id="deleteTrainer"
            type="button"
            style={{ display: trainer ? "inline-block" : "none" }}
            disabled={busy}
            onClick={onDelete}
          >
            Delete
          </button>
          <button className={"primary-action" + (busy ? " is-busy" : "")} type="submit" disabled={busy}>
            {busy ? "Saving..." : "Save trainer"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
