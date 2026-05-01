import Image from "next/image";

export function GuideRail({
  message,
  date,
  duration,
}: {
  message: string;
  date: string;
  duration: string;
}) {
  return (
    <aside className="guiderail" aria-label="Guide character">
      <span className="guiderail__avatar">
        <Image
          src="/assets/avatar-canonical-v1.png"
          alt=""
          width={120}
          height={120}
          aria-hidden="true"
        />
      </span>
      <p className="guiderail__bubble">{message}</p>
      <span className="guiderail__date">
        <span>{date}</span>
        <span>{duration}</span>
      </span>
    </aside>
  );
}
