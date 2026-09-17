import { getInitials } from "../lib/format.js";

/** photoMarkup() from the original: a photo when there is one, initials otherwise. */
export default function Photo({ person, className = "member-photo" }) {
  if (person.photo) {
    return <img className={className} src={person.photo} alt={`${person.name} photo`} />;
  }
  return (
    <div className="avatar-fallback" aria-hidden="true">
      {getInitials(person.name)}
    </div>
  );
}
