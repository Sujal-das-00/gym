import { useEffect, useState } from "react";
import { useApp } from "../store/AppContext.jsx";
import Dialog from "../components/Dialog.jsx";
import { normalizeTrainer } from "../lib/trainers.js";
import { readPhoto } from "../lib/photo.js";

export default function TrainerDialog() {
  const { trainerDialog, closeTrainerDialog, saveTrainer, deleteTrainer } = useApp();
  const trainer = trainerDialog.trainer;

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [shift, setShift] = useState("");
  const [status, setStatus] = useState("active");
  const [bio, setBio] = useState("");
  const [photo, setPhoto] = useState("");

  useEffect(() => {
    if (!trainerDialog.open) return;
    setName(trainer?.name || "");
    setPhone(trainer?.phone || "");
    setSpecialty(trainer?.specialty || "");
    setShift(trainer?.shift || "");
    setStatus(trainer?.status || "active");
    setBio(trainer?.bio || "");
    setPhoto(trainer?.photo || "");
  }, [trainerDialog.open, trainer]);

  const onPhotoChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setPhoto(await readPhoto(file));
  };

  const onSubmit = (event) => {
    event.preventDefault();
    const payload = normalizeTrainer({
      id: trainer?.id || undefined,
      name,
      phone,
      specialty,
      shift,
      status,
      bio,
      photo,
      attendance: trainer?.attendance || [],
      createdAt: trainer?.createdAt,
    });
    saveTrainer(payload, Boolean(trainer?.id));
    closeTrainerDialog();
  };

  const onDelete = () => {
    if (!trainer?.id) return;
    if (!confirm("Delete " + (trainer.name || "this trainer") + "?")) return;
    deleteTrainer(trainer.id);
    closeTrainerDialog();
  };

  return (
    <Dialog className="member-dialog" id="trainerDialog" open={trainerDialog.open} onClose={closeTrainerDialog}>
      <form className="member-form" id="trainerForm" method="dialog" onSubmit={onSubmit}>
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
              required
              autoComplete="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label>
            Mobile number
            <input
              id="trainerPhoneInput"
              name="phone"
              required
              inputMode="tel"
              autoComplete="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
            />
          </label>
          <label>
            Specialty
            <input
              id="trainerSpecialtyInput"
              name="specialty"
              placeholder="Strength, yoga, cardio"
              required
              value={specialty}
              onChange={(event) => setSpecialty(event.target.value)}
            />
          </label>
          <label>
            Shift
            <input
              id="trainerShiftInput"
              name="shift"
              placeholder="Morning, evening, full day"
              required
              value={shift}
              onChange={(event) => setShift(event.target.value)}
            />
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
              placeholder="Experience, certifications, or assigned batches"
              value={bio}
              onChange={(event) => setBio(event.target.value)}
            />
          </label>
        </div>

        <div className="form-actions">
          <button
            className="secondary-action"
            id="deleteTrainer"
            type="button"
            style={{ display: trainer ? "inline-block" : "none" }}
            onClick={onDelete}
          >
            Delete
          </button>
          <button className="primary-action" type="submit">
            Save trainer
          </button>
        </div>
      </form>
    </Dialog>
  );
}
