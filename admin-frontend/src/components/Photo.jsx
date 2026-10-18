import { getInitials } from "../lib/format.js";

/** photoMarkup() from the original: a photo when there is one, initials otherwise. */
export default function Photo({ person, className = "member-photo" }) {
  if (person.photo) {
    // Lazy + async decode: a long member list doesn't fetch or decode every
    // avatar up front, and decoding never blocks a scroll or tap.
    return (
      <img className={className} src={person.photo} alt={`${person.name} photo`} loading="lazy" decoding="async" />
    );
  }
  return (
    <div className="avatar-fallback" aria-hidden="true">
      {getInitials(person.name)}
    </div>
  );
}
