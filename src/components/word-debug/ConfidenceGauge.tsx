// Renders the Wilson lower bound on the bucket scale so the parent can
// see "we're 0.42 confident you know this; 0.55 unlocks Building".

import type { MasteryColour } from "@/lib/types";

const BANDS: Array<{ from: number; to: number; colour: MasteryColour; label: string }> = [
  { from: 0, to: 0.3, colour: "red", label: "Needs work" },
  { from: 0.3, to: 0.55, colour: "orange", label: "Building" },
  { from: 0.55, to: 0.7, colour: "yellow", label: "Nearly steady" },
  { from: 0.7, to: 0.8, colour: "light_green", label: "Reliable" },
  { from: 0.8, to: 1, colour: "green", label: "Mastered" },
];

const COLOUR_FILL: Record<MasteryColour, string> = {
  red: "var(--mastery-red)",
  orange: "var(--mastery-orange)",
  yellow: "var(--mastery-yellow)",
  light_green: "var(--mastery-light)",
  green: "var(--mastery-green)",
};

export function ConfidenceGauge({
  lowerBound,
  pHat,
  effectiveN,
}: {
  lowerBound: number;
  pHat: number;
  effectiveN: number;
}) {
  const lb = Math.max(0, Math.min(1, lowerBound));
  const ph = Math.max(0, Math.min(1, pHat));
  return (
    <div className="cgauge">
      <div className="cgauge__bar" role="img" aria-label={`Lower bound ${(lb * 100).toFixed(0)}%, naive ratio ${(ph * 100).toFixed(0)}%`}>
        {BANDS.map((band) => (
          <span
            key={band.label}
            className="cgauge__band"
            style={{
              left: `${band.from * 100}%`,
              width: `${(band.to - band.from) * 100}%`,
              background: COLOUR_FILL[band.colour],
            }}
            title={band.label}
          />
        ))}
        {/* Naive mean tick (ghost) */}
        <span
          className="cgauge__tick cgauge__tick--ghost"
          style={{ left: `${ph * 100}%` }}
          title={`Naive ratio: ${(ph * 100).toFixed(0)}%`}
        />
        {/* Wilson lower-bound tick (the one that drives the colour) */}
        <span
          className="cgauge__tick cgauge__tick--main"
          style={{ left: `${lb * 100}%` }}
          title={`Lower bound: ${(lb * 100).toFixed(0)}%`}
        />
      </div>
      <div className="cgauge__legend">
        {BANDS.map((band) => (
          <span key={band.label} style={{ flex: band.to - band.from }}>
            {band.label}
          </span>
        ))}
      </div>
      <p className="cgauge__caption">
        Wilson 80% lower bound is{" "}
        <strong>{(lb * 100).toFixed(0)}%</strong> on n_eff{" "}
        <strong>{effectiveN.toFixed(2)}</strong>. The naive correct ratio
        is {(ph * 100).toFixed(0)}% (ghost tick) — same mean, less
        evidence than 5/5 would give.
      </p>
    </div>
  );
}
