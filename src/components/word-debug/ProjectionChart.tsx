// Two stacked charts (one SVG): forgetting curve + pick probability over
// the next 14 days (assuming the word is not practised). Shared X axis.

import type { DayProjection } from "@/lib/learning/projection";

export function ProjectionChart({ projection }: { projection: DayProjection[] }) {
  if (projection.length === 0) {
    return (
      <p className="empty-state">
        No projection — this word has not been answered yet, so the
        forgetting curve has nothing to anchor.
      </p>
    );
  }

  const width = 720;
  const height = 280;
  const margin = { top: 18, right: 18, bottom: 36, left: 56 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;
  const xs = projection.map((p) => p.daysFromNow);
  const xMin = xs[0];
  const xMax = xs[xs.length - 1];

  const x = (d: number) => margin.left + ((d - xMin) / (xMax - xMin)) * innerW;
  const y = (v: number) => margin.top + (1 - v) * innerH;

  // Recall curve points
  const recallPath = projection
    .map((p, i) => `${i === 0 ? "M" : "L"} ${x(p.daysFromNow).toFixed(1)} ${y(p.recall).toFixed(1)}`)
    .join(" ");
  // Pick-probability points
  const probPath = projection
    .map((p, i) => `${i === 0 ? "M" : "L"} ${x(p.daysFromNow).toFixed(1)} ${y(p.probability).toFixed(1)}`)
    .join(" ");

  // Find first day where pick probability crosses 0.5 (i.e. likely-pick day)
  const likelyPickDay = projection.find((p) => p.probability >= 0.5)?.daysFromNow;

  return (
    <div className="projection">
      <svg
        width="100%"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Forecast over next 14 days"
        style={{ overflow: "visible" }}
      >
        {/* y gridlines + labels */}
        {[0, 0.25, 0.5, 0.72, 0.85, 1].map((v) => (
          <g key={v}>
            <line
              x1={margin.left}
              x2={width - margin.right}
              y1={y(v)}
              y2={y(v)}
              stroke="rgba(31,41,55,0.08)"
              strokeDasharray={v === 0.72 ? "4 4" : "1 3"}
            />
            <text
              x={margin.left - 8}
              y={y(v) + 4}
              textAnchor="end"
              fontFamily="var(--font-mono)"
              fontSize="10"
              fill="var(--muted-slate)"
            >
              {(v * 100).toFixed(0)}%
            </text>
          </g>
        ))}
        {/* x labels (every 2 days) */}
        {xs.filter((d) => d % 2 === 0).map((d) => (
          <text
            key={d}
            x={x(d)}
            y={height - 12}
            textAnchor="middle"
            fontFamily="var(--font-mono)"
            fontSize="10"
            fill="var(--muted-slate)"
          >
            d{d}
          </text>
        ))}
        {/* Recall curve */}
        <path d={recallPath} fill="none" stroke="var(--hint-sky)" strokeWidth="2" />
        {/* Pick probability */}
        <path d={probPath} fill="none" stroke="var(--forest-green)" strokeWidth="2" />
        {/* Inspectable data points — hover/title shows the breakdown */}
        {projection.map((p) => {
          const topFactor = [...p.breakdown.factors].sort(
            (a, b) => b.contribution - a.contribution
          )[0];
          const title = `Day ${p.daysFromNow}\nRank ${p.projectedRank}\nScore ${p.projectedScore.toFixed(2)}\nPick chance ${(p.probability * 100).toFixed(0)}%\nTop factor: ${topFactor ? `${topFactor.name} (${topFactor.contribution >= 0 ? "+" : ""}${topFactor.contribution.toFixed(2)})` : "—"}`;
          return (
            <g key={p.daysFromNow}>
              <circle
                cx={x(p.daysFromNow)}
                cy={y(p.probability)}
                r={p.daysFromNow === likelyPickDay ? 4.5 : 3}
                fill="var(--forest-green)"
                stroke="var(--paper-canvas)"
                strokeWidth={1}
              >
                <title>{title}</title>
              </circle>
              <circle
                cx={x(p.daysFromNow)}
                cy={y(p.recall)}
                r={3}
                fill="var(--hint-sky)"
                stroke="var(--paper-canvas)"
                strokeWidth={1}
              >
                <title>{title}</title>
              </circle>
            </g>
          );
        })}
        {/* Likely-pick marker */}
        {likelyPickDay !== undefined ? (
          <line
            x1={x(likelyPickDay)}
            x2={x(likelyPickDay)}
            y1={margin.top}
            y2={height - margin.bottom}
            stroke="var(--mastery-orange)"
            strokeDasharray="4 3"
          />
        ) : null}
        {/* Threshold band marker — review threshold */}
        <line
          x1={margin.left}
          x2={width - margin.right}
          y1={y(0.72)}
          y2={y(0.72)}
          stroke="rgba(123,167,201,0.55)"
          strokeDasharray="2 4"
        />
      </svg>
      <p
        style={{
          margin: 0,
          fontFamily: "var(--font-body)",
          fontSize: 13,
          color: "var(--steel-secondary)",
        }}
      >
        Hover any point to see the rank, score, and the largest factor
        for that day. Spikes happen when a step-function bonus
        (delayed-recall, almost-mastered) flips on for this word a day
        or two before it flips on for the rest of the deck. Once the
        others catch up the relative rank flattens.
      </p>
      <ul className="projection__legend">
        <li>
          <span className="projection__swatch" style={{ background: "var(--hint-sky)" }} />
          Recall (forgetting curve)
        </li>
        <li>
          <span className="projection__swatch" style={{ background: "var(--forest-green)" }} />
          Pick probability (next round)
        </li>
        {likelyPickDay !== undefined ? (
          <li>
            <span
              className="projection__swatch"
              style={{
                background: "transparent",
                borderTop: "2px dashed var(--mastery-orange)",
              }}
            />
            ~50% pick chance lands at <strong>day {likelyPickDay}</strong>
          </li>
        ) : null}
        <li>
          <span
            className="projection__swatch"
            style={{
              background: "transparent",
              borderTop: "2px dashed rgba(123,167,201,0.7)",
            }}
          />
          Review threshold (recall = 72%)
        </li>
      </ul>
    </div>
  );
}
