interface NexusLogoProps {
  size?: number;
  className?: string;
  animate?: boolean;
}

export default function NexusLogo({ size = 40, className = '', animate = true }: NexusLogoProps) {
  const strokeWidth = size > 32 ? 1.5 : 1;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <linearGradient id="aurora-stroke" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="oklch(0.75 0.18 195)" />
          <stop offset="50%" stopColor="oklch(0.65 0.2 240)" />
          <stop offset="100%" stopColor="oklch(0.6 0.25 280)" />
        </linearGradient>
        <linearGradient id="aurora-fill" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="oklch(0.75 0.18 195 / 0.15)" />
          <stop offset="100%" stopColor="oklch(0.6 0.25 280 / 0.08)" />
        </linearGradient>
        {animate && (
          <filter id="glow">
            <feGaussianBlur stdDeviation="1.5" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        )}
      </defs>

      {/* Hexagonal shield */}
      <path
        d="M24 4L42 14V34L24 44L6 34V14L24 4Z"
        fill="url(#aurora-fill)"
        stroke="url(#aurora-stroke)"
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        filter={animate ? 'url(#glow)' : undefined}
      />

      {/* Inner neural mesh */}
      <path
        d="M24 12L34 18V30L24 36L14 30V18L24 12Z"
        fill="none"
        stroke="url(#aurora-stroke)"
        strokeWidth={strokeWidth * 0.7}
        strokeLinejoin="round"
        opacity="0.6"
      />

      {/* Neural connections */}
      <line x1="24" y1="4" x2="24" y2="12" stroke="url(#aurora-stroke)" strokeWidth={strokeWidth * 0.5} opacity="0.4" />
      <line x1="42" y1="14" x2="34" y2="18" stroke="url(#aurora-stroke)" strokeWidth={strokeWidth * 0.5} opacity="0.4" />
      <line x1="42" y1="34" x2="34" y2="30" stroke="url(#aurora-stroke)" strokeWidth={strokeWidth * 0.5} opacity="0.4" />
      <line x1="24" y1="44" x2="24" y2="36" stroke="url(#aurora-stroke)" strokeWidth={strokeWidth * 0.5} opacity="0.4" />
      <line x1="6" y1="34" x2="14" y2="30" stroke="url(#aurora-stroke)" strokeWidth={strokeWidth * 0.5} opacity="0.4" />
      <line x1="6" y1="14" x2="14" y2="18" stroke="url(#aurora-stroke)" strokeWidth={strokeWidth * 0.5} opacity="0.4" />

      {/* Center node */}
      <circle cx="24" cy="24" r="3" fill="url(#aurora-stroke)" opacity="0.9">
        {animate && (
          <animate attributeName="r" values="2.5;3.5;2.5" dur="3s" repeatCount="indefinite" />
        )}
      </circle>

      {/* Vertex nodes */}
      {[
        [24, 12], [34, 18], [34, 30], [24, 36], [14, 30], [14, 18],
      ].map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r="1.5" fill="url(#aurora-stroke)" opacity="0.6" />
      ))}
    </svg>
  );
}
