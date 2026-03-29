import { useTenant, type TenantTier } from './TenantContext';

const TIER_COLORS: Record<TenantTier, { stroke: string; glow: string; pulse: string }> = {
  individual: {
    stroke: '#22d3ee',
    glow: 'rgba(34, 211, 238, 0.4)',
    pulse: 'rgba(34, 211, 238, 0.15)',
  },
  smb: {
    stroke: '#f59e0b',
    glow: 'rgba(245, 158, 11, 0.4)',
    pulse: 'rgba(245, 158, 11, 0.15)',
  },
  enterprise: {
    stroke: '#a78bfa',
    glow: 'rgba(167, 139, 250, 0.4)',
    pulse: 'rgba(167, 139, 250, 0.15)',
  },
};

interface NexusLogoProps {
  size?: number;
  className?: string;
  tierOverride?: TenantTier;
}

export default function NexusLogo({ size = 40, className = '', tierOverride }: NexusLogoProps) {
  let tier: TenantTier = 'individual';
  try {
    const tenant = useTenant();
    tier = tierOverride ?? tenant.tier;
  } catch {
    tier = tierOverride ?? 'individual';
  }
  
  const colors = TIER_COLORS[tier];
  const id = `nexus-logo-${tier}`;

  return (
    <div className={`relative inline-flex items-center justify-center ${className}`} style={{ width: size, height: size }}>
      <svg
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        className="nexus-logo-svg"
      >
        <defs>
          <filter id={`${id}-glow`}>
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <linearGradient id={`${id}-grad`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={colors.stroke} stopOpacity="1" />
            <stop offset="50%" stopColor={colors.stroke} stopOpacity="0.6" />
            <stop offset="100%" stopColor={colors.stroke} stopOpacity="1" />
          </linearGradient>
        </defs>

        {/* Outer breathing ring */}
        <circle
          cx="32"
          cy="32"
          r="28"
          stroke={colors.pulse}
          strokeWidth="1"
          fill="none"
          className="nexus-ring-outer"
        />

        {/* Middle ring with dash animation */}
        <circle
          cx="32"
          cy="32"
          r="24"
          stroke={`url(#${id}-grad)`}
          strokeWidth="1.5"
          fill="none"
          strokeDasharray="8 4"
          className="nexus-ring-dash"
          filter={`url(#${id}-glow)`}
        />

        {/* Core shield hexagon path */}
        <path
          d="M32 10L50 20V38L32 54L14 38V20L32 10Z"
          stroke={colors.stroke}
          strokeWidth="2"
          fill="none"
          strokeLinejoin="round"
          className="nexus-shield"
          filter={`url(#${id}-glow)`}
        />

        {/* Inner lock/key motif */}
        <circle
          cx="32"
          cy="28"
          r="5"
          stroke={colors.stroke}
          strokeWidth="1.5"
          fill="none"
          className="nexus-keyhole-ring"
        />
        <path
          d="M32 33V42"
          stroke={colors.stroke}
          strokeWidth="2"
          strokeLinecap="round"
          className="nexus-keyhole-stem"
        />
        <circle
          cx="32"
          cy="28"
          r="2"
          fill={colors.stroke}
          className="nexus-keyhole-dot"
        />
      </svg>

      <style>{`
        .nexus-ring-outer {
          animation: nexus-breathe-${tier} 4s ease-in-out infinite;
        }
        .nexus-ring-dash {
          animation: nexus-rotate 12s linear infinite;
        }
        .nexus-shield {
          animation: nexus-shield-pulse-${tier} ${tier === 'enterprise' ? '1.5s' : tier === 'smb' ? '3s' : '4s'} ease-in-out infinite;
        }
        .nexus-keyhole-dot {
          animation: nexus-dot-pulse ${tier === 'enterprise' ? '1s' : '2s'} ease-in-out infinite;
        }
        @keyframes nexus-breathe-${tier} {
          0%, 100% { r: 28; opacity: 0.3; }
          50% { r: 30; opacity: 0.6; }
        }
        @keyframes nexus-rotate {
          from { transform-origin: center; transform: rotate(0deg); }
          to { transform-origin: center; transform: rotate(360deg); }
        }
        @keyframes nexus-shield-pulse-${tier} {
          0%, 100% { stroke-opacity: 0.7; filter: url(#${id}-glow); }
          50% { stroke-opacity: 1; }
        }
        @keyframes nexus-dot-pulse {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
