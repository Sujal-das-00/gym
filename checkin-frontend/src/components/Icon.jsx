// Google Material Symbols glyph — the font is loaded from index.html.
export default function Icon({ name, className = "", style }) {
  return (
    <span aria-hidden="true" className={("material-symbols-outlined " + className).trim()} style={style}>
      {name}
    </span>
  );
}
