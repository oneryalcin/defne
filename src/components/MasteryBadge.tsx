import type { MasteryColour } from "@/lib/types";

const labels: Record<MasteryColour, string> = {
  red: "Red",
  orange: "Orange",
  yellow: "Yellow",
  light_green: "Light green",
  green: "Green"
};

export function MasteryBadge({ colour }: { colour: MasteryColour }) {
  return (
    <span className={`mastery-badge colour-${colour}`}>
      <span className="mastery-dot" aria-hidden="true" />
      {labels[colour]}
    </span>
  );
}
