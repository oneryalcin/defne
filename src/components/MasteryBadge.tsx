import type { MasteryColour } from "@/lib/types";

const labels: Record<MasteryColour, string> = {
  red: "Needs work",
  orange: "Building",
  yellow: "Nearly steady",
  light_green: "Reliable",
  green: "Mastered"
};

export function MasteryBadge({ colour }: { colour: MasteryColour }) {
  return (
    <span className={`mastery-badge colour-${colour}`}>
      <span className="mastery-dot" aria-hidden="true" />
      {labels[colour]}
    </span>
  );
}
