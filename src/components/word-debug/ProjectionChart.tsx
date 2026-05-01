"use client";

import { useState } from "react";
import type { DayProjection } from "@/lib/learning/projection";

const WIDTH = 720;
const HEIGHT = 280;
const MARGIN = { top: 18, right: 18, bottom: 36, left: 56 };

export function ProjectionChart({ projection }: { projection: DayProjection[] }) {
  const [hovered, setHovered] = useState<number | null>(null);

  if (projection.length === 0) {
    return (
      <p className="empty-state">
        No projection — this word has not been answered yet, so the
        forgetting curve has nothing to anchor.
      </p>
    );
  }

  const innerW = WIDTH - MARGIN.left - MARGIN.right;
  const innerH = HEIGHT - MARGIN.top - MARGIN.bottom;
  const xs = projection.map((p) => p.daysFromNow);
  const xMin = xs[0];
  const xMax = xs[xs.length - 1];

  const x = (d: number) =>
    MARGIN.left + ((d - xMin) / (xMax - xMin)) * innerW;
  const y = (v: number) => MARGIN.top + (1 - v) * innerH;

  const recallPath = projection
    .map((p, i) => `${i === 0 ? "M" : "L"} ${x(p.daysFromNow).toFixed(1)} ${y(p.recall).toFixed(1)}`)
    .join(" ");
  const probPath = projection
    .map((p, i) => `${i === 0 ? "M" : "L"} ${x(p.daysFromNow).toFixed(1)} ${y(p.probability).toFixed(1)}`)
    .join(" ");

  const likelyPickDay = projection.find((p) => p.probability >= 0.5)?.daysFromNow;
  const hoveredPoint =
    hovered != null ? projection.find((p) => p.daysFromNow === hovered) : null;

  return (
    <div className="projection">
      <div className="projection__chart-wrap">
        <svg
          width="100%"
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          role="img"
          aria-label="Forecast over next 14 days"
          style={{ overflow: "visible", display: "block" }}
          preserveAspectRatio="xMidYMid meet"
          onMouseLeave={() => setHovered(null)}
        >
          {/* gridlines + y labels */}
          {[0, 0.25, 0.5, 0.72, 0.85, 1].map((v) => (
            <g key={v}>
              <line
                x1={MARGIN.left}
                x2={WIDTH - MARGIN.right}
                y1={y(v)}
                y2={y(v)}
                stroke="rgba(31,41,55,0.08)"
                strokeDasharray={v === 0.72 ? "4 4" : "1 3"}
              />
              <text
                x={MARGIN.left - 8}
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
          {/* x labels */}
          {xs.filter((d) => d % 2 === 0).map((d) => (
            <text
              key={d}
              x={x(d)}
              y={HEIGHT - 12}
              textAnchor="middle"
              fontFamily="var(--font-mono)"
              fontSize="10"
              fill="var(--muted-slate)"
            >
              d{d}
            </text>
          ))}
          {/* curves */}
          <path d={recallPath} fill="none" stroke="var(--hint-sky)" strokeWidth="2" />
          <path d={probPath} fill="none" stroke="var(--forest-green)" strokeWidth="2" />
          {/* likely-pick marker */}
          {likelyPickDay !== undefined ? (
            <line
              x1={x(likelyPickDay)}
              x2={x(likelyPickDay)}
              y1={MARGIN.top}
              y2={HEIGHT - MARGIN.bottom}
              stroke="var(--mastery-orange)"
              strokeDasharray="4 3"
            />
          ) : null}
          {/* hovered crosshair */}
          {hoveredPoint ? (
            <line
              x1={x(hoveredPoint.daysFromNow)}
              x2={x(hoveredPoint.daysFromNow)}
              y1={MARGIN.top}
              y2={HEIGHT - MARGIN.bottom}
              stroke="rgba(31,41,55,0.30)"
              strokeWidth={1}
            />
          ) : null}
          {/* visible data points */}
          {projection.map((p) => (
            <g key={`pts-${p.daysFromNow}`}>
              <circle
                cx={x(p.daysFromNow)}
                cy={y(p.probability)}
                r={hovered === p.daysFromNow ? 6 : p.daysFromNow === likelyPickDay ? 4.5 : 3}
                fill="var(--forest-green)"
                stroke="var(--paper-canvas)"
                strokeWidth={1}
              />
              <circle
                cx={x(p.daysFromNow)}
                cy={y(p.recall)}
                r={hovered === p.daysFromNow ? 5 : 3}
                fill="var(--hint-sky)"
                stroke="var(--paper-canvas)"
                strokeWidth={1}
              />
            </g>
          ))}
          {/* large invisible hit-targets for hover (one per day) */}
          {projection.map((p) => {
            const xc = x(p.daysFromNow);
            const halfStep = innerW / Math.max(1, projection.length - 1) / 2;
            return (
              <rect
                key={`hit-${p.daysFromNow}`}
                x={xc - halfStep}
                y={MARGIN.top}
                width={halfStep * 2}
                height={innerH}
                fill="transparent"
                onMouseEnter={() => setHovered(p.daysFromNow)}
                onFocus={() => setHovered(p.daysFromNow)}
                tabIndex={0}
                aria-label={`Day ${p.daysFromNow}: rank ${p.projectedRank}, pick ${(p.probability * 100).toFixed(0)}%`}
                style={{ cursor: "crosshair" }}
              />
            );
          })}
        </svg>
        {/* hover tooltip overlay */}
        {hoveredPoint ? (
          <ProjectionTooltip point={hoveredPoint} xPct={(x(hoveredPoint.daysFromNow) / WIDTH) * 100} />
        ) : null}
      </div>

      <p
        style={{
          margin: 0,
          fontFamily: "var(--font-body)",
          fontSize: 13,
          color: "var(--steel-secondary)",
        }}
      >
        Hover any column to see the rank, score, and the largest factor
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

function ProjectionTooltip({
  point,
  xPct,
}: {
  point: DayProjection;
  xPct: number;
}) {
  const topFactor = [...point.breakdown.factors].sort(
    (a, b) => b.contribution - a.contribution
  )[0];
  const allFactors = [...point.breakdown.factors].sort(
    (a, b) => Math.abs(b.contribution) - Math.abs(a.contribution)
  );
  // Right-align the tooltip if we're in the right half of the chart.
  const alignRight = xPct > 60;
  return (
    <div
      className="projection__tip"
      style={{
        left: alignRight ? "auto" : `${xPct}%`,
        right: alignRight ? `${100 - xPct}%` : "auto",
      }}
    >
      <strong>Day {point.daysFromNow}</strong>
      <dl className="projection__tip-grid">
        <dt>Rank</dt>
        <dd>{point.projectedRank}</dd>
        <dt>Score</dt>
        <dd>{point.projectedScore.toFixed(2)}</dd>
        <dt>Recall</dt>
        <dd>{(point.recall * 100).toFixed(0)}%</dd>
        <dt>Pick chance</dt>
        <dd>{(point.probability * 100).toFixed(0)}%</dd>
      </dl>
      {topFactor ? (
        <p className="projection__tip-factor">
          Top factor: <strong>{topFactor.name}</strong> (
          {topFactor.contribution >= 0 ? "+" : ""}
          {topFactor.contribution.toFixed(2)}) — {topFactor.note}
        </p>
      ) : null}
      <details className="projection__tip-details">
        <summary>All factors</summary>
        <ul>
          {allFactors.map((f) => (
            <li key={f.name}>
              <span>{f.name}</span>
              <span style={{ color: f.contribution < 0 ? "var(--mastery-red)" : "var(--graphite-ink)" }}>
                {f.contribution >= 0 ? "+" : ""}
                {f.contribution.toFixed(2)}
              </span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
