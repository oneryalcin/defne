type Stop = {
  word: string;
  state: "done" | "current" | "locked";
  x: number;
  y: number;
};

export function PencilMap({
  stops,
  caption,
  className,
}: {
  stops: Stop[];
  caption?: string;
  className?: string;
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 800 360"
      role="img"
      aria-label={caption ?? "Pencil-sketch journey landscape"}
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <pattern id="paperGrain" x="0" y="0" width="6" height="6" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="0.4" fill="rgba(31,41,55,0.05)" />
        </pattern>
      </defs>

      <path
        d="M0 280 C 120 270, 180 240, 260 230 S 420 220, 520 200 S 680 140, 800 110 L 800 360 L 0 360 Z"
        fill="rgba(127,176,105,0.08)"
        stroke="none"
      />

      <path
        d="M40 290 C 160 270, 220 250, 320 240 S 460 230, 560 200 S 680 130, 760 80"
        stroke="rgba(31,41,55,0.45)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeDasharray="2 8"
        fill="none"
      />

      <g stroke="rgba(31,41,55,0.55)" strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round" fill="none">
        <path d="M120 290 L130 270 L140 290 Z M126 290 L130 296 M134 290 L130 296" />
        <path d="M250 270 L262 245 L274 270 Z M258 270 L262 280 M266 270 L262 280" />
        <path d="M620 180 L634 148 L648 180 Z M628 180 L634 192 M640 180 L634 192" />
      </g>

      <g stroke="rgba(31,41,55,0.7)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" fill="none">
        <path d="M700 60 L740 95 L760 70 L770 90" />
        <path d="M770 90 L770 50 L795 50" stroke="#D1495B" strokeWidth="2" />
        <path d="M770 50 L795 55 L770 60 Z" fill="#D1495B" stroke="#D1495B" />
      </g>

      {stops.map((stop) => {
        const fill =
          stop.state === "done"
            ? "var(--mastery-light)"
            : stop.state === "current"
            ? "var(--graphite-ink)"
            : "var(--paper-canvas)";
        const stroke =
          stop.state === "current" ? "var(--graphite-ink)" : "rgba(31,41,55,0.45)";
        const labelColor =
          stop.state === "locked" ? "var(--muted-slate)" : "var(--graphite-ink)";
        return (
          <g key={stop.word} transform={`translate(${stop.x} ${stop.y})`}>
            <text
              x="0"
              y="-14"
              textAnchor="middle"
              fontFamily="Fraunces, serif"
              fontStyle="italic"
              fontWeight="500"
              fontSize="14"
              fill={labelColor}
            >
              {stop.word}
            </text>
            <circle cx="0" cy="0" r="6" fill={fill} stroke={stroke} strokeWidth="1.5" />
            {stop.state === "current" ? (
              <text
                x="0"
                y="22"
                textAnchor="middle"
                fontFamily="Geist Mono, monospace"
                fontSize="9"
                letterSpacing="1.4"
                fill="var(--muted-slate)"
              >
                YOU ARE HERE
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}
