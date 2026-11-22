import { useId } from "react";
import { MARK } from "../lib/mark.mjs";

type Props = { size?: number; className?: string };

export default function BrandMark({ size = 22, className }: Props) {
  const gradient = useId();
  const { width, height, horizon, trail, home, head, colors } = MARK;
  return (
    <svg width={(size * width) / height} height={size} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" className={className} fill="none">
      <defs>
        <linearGradient id={gradient} x1="0" x2="1">
          <stop offset="0" stopColor={colors.trailFrom} />
          <stop offset=".55" stopColor={colors.trailMid} />
          <stop offset="1" stopColor={colors.trailTo} />
        </linearGradient>
      </defs>
      <path d={horizon} stroke={colors.horizon} strokeWidth=".8" />
      <path d={trail} fill={`url(#${gradient})`} />
      <circle cx={home.x} cy={home.y} r={home.r} fill={colors.home} />
      <circle cx={head.x} cy={head.y} r={head.r} fill={colors.head} />
    </svg>
  );
}
