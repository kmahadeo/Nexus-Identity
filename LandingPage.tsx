import { useEffect, useRef, useState } from 'react';
import { useInternetIdentity } from './hooks/useInternetIdentity';
import type { UserRole } from './hooks/useInternetIdentity';
import { ArrowRight, Moon, Sun, Fingerprint, Key, Shield, Zap, Lock, Globe, ChevronLeft, User, Users, Wrench, Eye, Crown } from 'lucide-react';
import * as THREE from 'three';
import NexusLogo from './NexusLogo';

type Theme = 'dark' | 'light';

/* ── Three.js WebGL Background ─────────────────────────────────────────── */
function useAuraShader(containerRef: React.RefObject<HTMLDivElement>, theme: Theme) {
  const materialRef = useRef<THREE.ShaderMaterial | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    camera.position.z = 1;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    el.appendChild(renderer.domElement);

    const vertexShader = `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position, 1.0);
      }
    `;

    const fragmentShader = `
      uniform float u_time;
      uniform vec2 u_resolution;
      uniform vec2 u_mouse;
      uniform vec3 u_colorCore;
      uniform vec3 u_colorFringe;
      uniform float u_isLightMode;
      varying vec2 vUv;

      vec2 hash(vec2 p) {
        p = vec2(dot(p,vec2(127.1,311.7)), dot(p,vec2(269.5,183.3)));
        return -1.0 + 2.0*fract(sin(p)*43758.5453123);
      }
      float noise(in vec2 p) {
        const float K1 = 0.366025404;
        const float K2 = 0.211324865;
        vec2 i = floor(p + (p.x+p.y)*K1);
        vec2 a = p - i + (i.x+i.y)*K2;
        vec2 o = (a.x>a.y) ? vec2(1.0,0.0) : vec2(0.0,1.0);
        vec2 b = a - o + K2;
        vec2 c = a - 1.0 + 2.0*K2;
        vec3 h = max(0.5-vec3(dot(a,a),dot(b,b),dot(c,c)),0.0);
        vec3 n = h*h*h*h*vec3(dot(a,hash(i+0.0)),dot(b,hash(i+o)),dot(c,hash(i+1.0)));
        return dot(n, vec3(70.0));
      }

      float sdArc(vec2 p, vec2 center, float radius, float width, float warp) {
        p.y += sin(p.x * 3.0 + u_time * 0.5) * warp;
        p.x += noise(p * 2.0 + u_time * 0.2) * (warp * 0.5);
        float d = length(p - center) - radius;
        return abs(d) - width;
      }

      void main() {
        vec2 uv = gl_FragCoord.xy / u_resolution.xy;
        vec2 st = uv;
        st.x *= u_resolution.x / u_resolution.y;
        vec2 mouseOffset = (u_mouse - 0.5) * 0.08;
        st += mouseOffset;

        vec2 center = vec2(0.2, 0.5);
        float d1 = sdArc(st, center, 0.80, 0.008, 0.10);
        float d2 = sdArc(st, center, 0.82, 0.035, 0.14);

        float coreGlow   = exp(-d1 * 45.0);
        float fringeGlow = exp(-d2 * 14.0);
        float wash = smoothstep(1.0, -0.2, st.x) * 0.28;

        vec3 finalColor = vec3(0.0);
        finalColor += u_colorCore * coreGlow;
        finalColor += u_colorFringe * fringeGlow;
        finalColor += u_colorFringe * wash * (sin(u_time * 0.8) * 0.08 + 0.92);
        finalColor = vec3(1.0) - exp(-finalColor * 2.0);

        float alpha = clamp(coreGlow + fringeGlow + wash, 0.0, 1.0);
        if (u_isLightMode > 0.5) {
          alpha = clamp(coreGlow * 1.4 + fringeGlow + wash * 0.5, 0.0, 0.55);
        }
        gl_FragColor = vec4(finalColor, alpha);
      }
    `;

    const getColors = () => {
      const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
      return {
        core:   new THREE.Color(isDark ? '#FFFFFF' : '#050608'),
        fringe: new THREE.Color(isDark ? '#4A88FF' : '#8BA3CC'),
        light:  isDark ? 0.0 : 1.0,
      };
    };

    const colors = getColors();
    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        u_time:       { value: 0 },
        u_resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
        u_mouse:      { value: new THREE.Vector2(0.5, 0.5) },
        u_colorCore:  { value: colors.core },
        u_colorFringe:{ value: colors.fringe },
        u_isLightMode:{ value: colors.light },
      },
      transparent: true,
      blending: THREE.NormalBlending,
    });
    materialRef.current = material;

    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    scene.add(mesh);

    const targetMouse = new THREE.Vector2(0.5, 0.5);
    const onMouse = (e: MouseEvent) => {
      targetMouse.x = e.clientX / window.innerWidth;
      targetMouse.y = 1 - e.clientY / window.innerHeight;
    };
    document.addEventListener('mousemove', onMouse);

    const clock = new THREE.Clock();
    let animId: number;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      material.uniforms.u_time.value = clock.getElapsedTime();
      material.uniforms.u_mouse.value.lerp(targetMouse, 0.05);
      renderer.render(scene, camera);
    };
    animate();

    const onResize = () => {
      renderer.setSize(window.innerWidth, window.innerHeight);
      material.uniforms.u_resolution.value.set(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(animId);
      document.removeEventListener('mousemove', onMouse);
      window.removeEventListener('resize', onResize);
      renderer.dispose();
      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement);
    };
  }, []);

  // Update colors when theme changes
  useEffect(() => {
    const mat = materialRef.current;
    if (!mat) return;
    const isDark = theme === 'dark';
    mat.uniforms.u_colorCore.value  = new THREE.Color(isDark ? '#FFFFFF' : '#050608');
    mat.uniforms.u_colorFringe.value= new THREE.Color(isDark ? '#4A88FF' : '#8BA3CC');
    mat.uniforms.u_isLightMode.value= isDark ? 0.0 : 1.0;
  }, [theme]);
}

/* ── Role cards config ──────────────────────────────────────────────────── */
const ROLES: Array<{
  role: UserRole;
  icon: any;
  label: string;
  desc: string;
  tier: 'individual' | 'smb' | 'enterprise';
  color: string;
  defaultName: string;
  defaultEmail: string;
}> = [
  { role: 'admin',       icon: Crown,   label: 'Admin',        desc: 'Full platform access, SIEM, compliance & team management',  tier: 'enterprise', color: '#a78bfa', defaultName: 'Admin User',       defaultEmail: 'admin@nexus.io'       },
  { role: 'individual',  icon: User,    label: 'Individual',   desc: 'Personal vault, passkeys, biometrics & threat insights',    tier: 'individual', color: '#22d3ee', defaultName: 'Alex Chen',         defaultEmail: 'alex@nexus.io'        },
  { role: 'team',        icon: Users,   label: 'Team Member',  desc: 'Shared vault, team collaboration & SSO integrations',       tier: 'smb',        color: '#f59e0b', defaultName: 'Sam Rivera',        defaultEmail: 'sam@nexus.io'         },
  { role: 'contractor',  icon: Wrench,  label: 'Contractor',   desc: 'Time-limited access to approved resources only',            tier: 'individual', color: '#fb923c', defaultName: 'Jordan Lee',        defaultEmail: 'contractor@nexus.io'  },
  { role: 'guest',       icon: Eye,     label: 'Guest',        desc: 'Read-only preview — explore the platform without changes',  tier: 'individual', color: '#94a3b8', defaultName: 'Guest User',        defaultEmail: 'guest@nexus.io'       },
];

/* ── Component ──────────────────────────────────────────────────────────── */
export default function LandingPage() {
  const { loginStatus, loginWithEmail, selectRole, pendingEmail } = useInternetIdentity();
  const [theme, setTheme] = useState<Theme>('dark');
  const webglRef = useRef<HTMLDivElement>(null);
  const isLoggingIn   = loginStatus === 'logging-in';
  const isSelectRole  = loginStatus === 'selecting-role';
  const [hoveredRole, setHoveredRole] = useState<UserRole | null>(null);
  const [platformLabel, setPlatformLabel] = useState('Biometric');
  const [hasPasskey, setHasPasskey] = useState(false);
  const [emailInput, setEmailInput] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [emailError, setEmailError] = useState('');

  useAuraShader(webglRef, theme);

  useEffect(() => {
    const ua = navigator.userAgent;
    if (/iPhone|iPad/.test(ua))      setPlatformLabel('Face ID / Touch ID');
    else if (/Mac/.test(ua))         setPlatformLabel('Touch ID');
    else if (/Win/.test(ua))         setPlatformLabel('Windows Hello');
    else if (/Android/.test(ua))     setPlatformLabel('Fingerprint');
    else                              setPlatformLabel('Security Key');

    const allKeys = Object.keys(localStorage).filter(k => k.startsWith('nexus-passkeys-'));
    const hasAny = allKeys.some(k => {
      try { return JSON.parse(localStorage.getItem(k) ?? '[]').length > 0; } catch { return false; }
    });
    setHasPasskey(hasAny);
  }, []);

  const handleContinue = (withPasskey = false) => {
    const em = emailInput.trim();
    if (!em || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
      setEmailError('Please enter a valid email address');
      return;
    }
    setEmailError('');
    loginWithEmail(em, withPasskey);
  };

  const toggleTheme = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    if (next === 'light') {
      document.documentElement.classList.remove('dark');
    } else {
      document.documentElement.classList.add('dark');
    }
  };

  return (
    <div className="aura-root" data-theme={theme}>
      {/* WebGL background */}
      <div ref={webglRef} id="aura-webgl" />

      {/* Corner tech labels */}
      <span className="aura-tech-label aura-label-tl">SYS.CORE // ON-LINE</span>
      <span className="aura-tech-label aura-label-bl">UPLINK_ESTABLISHED_</span>
      <span className="aura-tech-label aura-label-vr" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
        NEXUS · IDENTITY · PLATFORM
      </span>

      {/* Top bar */}
      <div className="aura-top-bar">
        <span className="aura-version-tag">V04.02</span>
        <button className="aura-theme-toggle" onClick={toggleTheme} aria-label="Toggle theme">
          {theme === 'dark'
            ? <><Moon size={13} /><span>DARK</span></>
            : <><Sun size={13} /><span>LIGHT</span></>
          }
        </button>
      </div>

      {/* Main grid */}
      <div className="aura-layout-grid">
        {/* Left branding panel */}
        <div style={{
          gridColumn: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: '40px',
          paddingRight: '8%',
        }}>
          {/* Logo + name */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <NexusLogo size={52} tierOverride="individual" />
            <div>
              <div style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: '11px',
                letterSpacing: '0.25em',
                color: 'var(--aura-text-tech)',
                textTransform: 'uppercase',
                marginBottom: '4px',
              }}>NEXUS.IDENTITY</div>
              <div style={{
                fontFamily: 'Space Grotesk, sans-serif',
                fontSize: '22px',
                fontWeight: 700,
                color: 'var(--aura-text-primary)',
                letterSpacing: '-0.02em',
              }}>Identity Fabric</div>
            </div>
          </div>

          {/* Headline */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <h2 style={{
              fontFamily: 'Space Grotesk, sans-serif',
              fontSize: 'clamp(28px, 3vw, 42px)',
              fontWeight: 700,
              color: 'var(--aura-text-primary)',
              letterSpacing: '-0.03em',
              lineHeight: 1.15,
              margin: 0,
            }}>
              Sovereign identity<br />
              <span style={{ color: 'var(--aura-text-secondary)' }}>without compromise.</span>
            </h2>
            <p style={{
              fontFamily: 'Space Grotesk, sans-serif',
              fontSize: '15px',
              color: 'var(--aura-text-secondary)',
              lineHeight: 1.6,
              maxWidth: '380px',
              margin: 0,
            }}>
              Military-grade encryption, AI threat monitoring, and passwordless authentication — zero-knowledge, zero-trust.
            </p>
          </div>

          {/* Feature pills */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {[
              { icon: Key, label: 'Passkeys & FIDO2', desc: 'Phishing-resistant passwordless login' },
              { icon: Lock, label: 'AES-256 Vault', desc: 'Zero-knowledge encrypted credential storage' },
              { icon: Zap, label: 'AI Threat Engine', desc: 'Real-time anomaly detection & auto-remediation' },
              { icon: Globe, label: 'Sovereign Architecture', desc: 'User-scoped identity, no central point of failure' },
            ].map(({ icon: Icon, label, desc }) => (
              <div key={label} style={{
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                padding: '12px 16px',
                borderRadius: '16px',
                background: 'var(--aura-bg-surface-1)',
                border: '1px solid rgba(255,255,255,0.05)',
              }}>
                <div style={{
                  padding: '8px',
                  borderRadius: '10px',
                  background: 'var(--aura-bg-surface-2)',
                  flexShrink: 0,
                }}>
                  <Icon size={16} style={{ color: 'var(--aura-text-primary)', opacity: 0.7 }} />
                </div>
                <div>
                  <div style={{
                    fontFamily: 'Space Grotesk, sans-serif',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: 'var(--aura-text-primary)',
                  }}>{label}</div>
                  <div style={{
                    fontFamily: 'Space Grotesk, sans-serif',
                    fontSize: '11px',
                    color: 'var(--aura-text-secondary)',
                    marginTop: '1px',
                  }}>{desc}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Tier badges */}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {[
              { label: 'Individual', color: '#22d3ee' },
              { label: 'SMB', color: '#f59e0b' },
              { label: 'Enterprise', color: '#a78bfa' },
            ].map(({ label, color }) => (
              <div key={label} style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: '10px',
                letterSpacing: '0.12em',
                color: color,
                padding: '4px 10px',
                borderRadius: '999px',
                border: `1px solid ${color}40`,
                background: `${color}10`,
              }}>{label.toUpperCase()}</div>
            ))}
          </div>
        </div>

        <div className="aura-auth-wrapper">
          <div className="aura-auth-panel animate-scale-in" style={{ maxWidth: isSelectRole ? 560 : 440 }}>

            {!isSelectRole ? (
              <>
                {/* Header */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div className="aura-system-badge">NEXUS.IDENTITY</div>
                  <h1 className="aura-h1">Authenticate</h1>
                  <p className="aura-subtitle">
                    {hasPasskey ? 'Welcome back — enter your email to continue.' : 'Enter your email to access your secure identity vault.'}
                  </p>
                </div>

                {/* Email input */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <input
                    type="email"
                    placeholder="you@example.com"
                    value={emailInput}
                    onChange={e => { setEmailInput(e.target.value); setEmailError(''); }}
                    onKeyDown={e => e.key === 'Enter' && handleContinue(hasPasskey)}
                    disabled={isLoggingIn}
                    style={{
                      width: '100%', padding: '12px 16px',
                      background: 'var(--aura-bg-surface-1)',
                      border: emailError ? '1px solid rgba(239,68,68,0.6)' : '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '14px', color: 'var(--aura-text-primary)',
                      fontFamily: 'Space Grotesk, sans-serif', fontSize: '14px',
                      outline: 'none', boxSizing: 'border-box',
                    }}
                  />
                  {emailError && (
                    <span style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: '11px', color: 'rgba(239,68,68,0.9)' }}>
                      {emailError}
                    </span>
                  )}
                </div>

                {/* Quick auth via passkey/biometric (shortcut — still requires email) */}
                {hasPasskey && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div className="aura-sso-grid">
                      <button
                        className="aura-btn-sso" title={`Passkey — ${platformLabel}`}
                        onClick={() => handleContinue(true)} disabled={isLoggingIn}
                      >
                        <Key size={20} />
                      </button>
                      <button
                        className="aura-btn-sso" title={platformLabel}
                        onClick={() => handleContinue(true)} disabled={isLoggingIn}
                      >
                        <Fingerprint size={20} />
                      </button>
                      <button
                        className="aura-btn-sso" title="FIDO2 / Zero-Trust"
                        onClick={() => handleContinue(true)} disabled={isLoggingIn}
                      >
                        <Shield size={20} />
                      </button>
                    </div>
                    <div style={{
                      padding: '10px 14px', borderRadius: '12px',
                      background: 'rgba(34,211,238,0.07)', border: '1px solid rgba(34,211,238,0.2)',
                      display: 'flex', alignItems: 'center', gap: '10px',
                    }}>
                      <Fingerprint size={15} style={{ color: '#22d3ee', flexShrink: 0 }} />
                      <span style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: '12px', color: 'rgba(255,255,255,0.7)' }}>
                        Passkey detected — use the icons above or click <strong style={{ color: '#22d3ee' }}>AUTHENTICATE</strong> below for {platformLabel}
                      </span>
                    </div>
                  </div>
                )}

                <div className="aura-divider">NEXUS IDENTITY</div>

                {/* CTA */}
                <button
                  className="aura-btn-primary"
                  onClick={() => handleContinue(hasPasskey)}
                  disabled={isLoggingIn}
                >
                  {isLoggingIn ? (
                    <>
                      AUTHENTICATING
                      <div className="aura-dots"><span /><span /><span /></div>
                    </>
                  ) : (
                    <>{hasPasskey ? `AUTHENTICATE WITH ${platformLabel.toUpperCase()}` : 'CONTINUE'}<ArrowRight size={18} /></>
                  )}
                </button>

                {/* Security notice */}
                <div style={{
                  padding: '10px 14px', borderRadius: '12px',
                  background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.2)',
                }}>
                  <p style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: '11px', color: 'rgba(245,158,11,0.85)', margin: 0, lineHeight: 1.5 }}>
                    ⚠️ First time? You'll select your role after entering your email. Returning users are automatically restored to their previous session.
                  </p>
                </div>

                <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '10px', letterSpacing: '0.1em', color: 'var(--aura-text-tech)', textAlign: 'center', lineHeight: 1.6 }}>
                  END-TO-END ENCRYPTED · FIDO2 CERTIFIED · ZERO KNOWLEDGE
                </p>
              </>
            ) : (
              /* ── Role selection (new users only) ── */
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div className="aura-system-badge">CREATE YOUR IDENTITY</div>
                  <h1 className="aura-h1" style={{ fontSize: 'clamp(22px, 3vw, 30px)' }}>Choose your role</h1>
                  <p className="aura-subtitle">
                    {pendingEmail && <span style={{ color: '#22d3ee' }}>{pendingEmail}</span>}
                    {pendingEmail ? ' — ' : ''}
                    Select your access level. You can request a role change from an admin later.
                  </p>
                </div>

                {/* Optional display name */}
                <input
                  type="text"
                  placeholder="Your name (optional)"
                  value={nameInput}
                  onChange={e => setNameInput(e.target.value)}
                  style={{
                    width: '100%', padding: '10px 14px',
                    background: 'var(--aura-bg-surface-1)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '12px', color: 'var(--aura-text-primary)',
                    fontFamily: 'Space Grotesk, sans-serif', fontSize: '13px',
                    outline: 'none', boxSizing: 'border-box',
                  }}
                />

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {ROLES.map(({ role, icon: Icon, label, desc, color, defaultName, tier }) => (
                    <button
                      key={role}
                      onClick={() => selectRole(role, nameInput.trim() || defaultName, pendingEmail || emailInput.trim() || `${role}@nexus.io`, tier)}
                      onMouseEnter={() => setHoveredRole(role)}
                      onMouseLeave={() => setHoveredRole(null)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '14px',
                        padding: '14px 18px', borderRadius: '16px', textAlign: 'left',
                        background: hoveredRole === role ? `${color}14` : 'var(--aura-bg-surface-1)',
                        border: `1px solid ${hoveredRole === role ? `${color}40` : 'rgba(255,255,255,0.06)'}`,
                        cursor: 'pointer', transition: 'all 0.18s ease', width: '100%',
                      }}
                    >
                      <div style={{ padding: '10px', borderRadius: '12px', background: `${color}18`, flexShrink: 0 }}>
                        <Icon size={18} style={{ color }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, fontSize: '14px', color: 'var(--aura-text-primary)', marginBottom: '2px' }}>{label}</div>
                        <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: '11px', color: 'var(--aura-text-secondary)', lineHeight: 1.4 }}>{desc}</div>
                      </div>
                      <ArrowRight size={14} style={{ color: 'var(--aura-text-tech)', flexShrink: 0 }} />
                    </button>
                  ))}
                </div>

                <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '10px', letterSpacing: '0.1em', color: 'var(--aura-text-tech)', textAlign: 'center' }}>
                  ROLE DEFINES FEATURE ACCESS AND PERMISSIONS — ADMINS CAN CHANGE THIS LATER
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
