const SEGMENTS = [
  { cls: "s-0", label: "Not started" },
  { cls: "s-1", label: "Emerging" },
  { cls: "s-2", label: "Developing" },
  { cls: "s-3", label: "Steady" },
  { cls: "s-4", label: "Strong" },
  { cls: "s-5", label: "Held" },
];

export function MasteryRail() {
  return (
    <div className="mastery-rail" aria-label="Mastery legend">
      <div className="mastery-rail__bar" role="presentation">
        {SEGMENTS.map((seg) => (
          <span key={seg.cls} className={`mastery-rail__seg ${seg.cls}`} />
        ))}
      </div>
      <div className="mastery-rail__legend">
        {SEGMENTS.map((seg) => (
          <span key={seg.label}>{seg.label}</span>
        ))}
      </div>
    </div>
  );
}
