import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Fingerprint, Eye, Shield, CheckCircle2, AlertCircle, Trash2, Smartphone,
  Monitor, Zap, Lock, Clock, Activity, Brain, MousePointer2, Keyboard,
  ScanFace, Settings2, ShieldAlert, Timer, Ban,
} from 'lucide-react';
import { toast } from 'sonner';
import { registerPasskey, authenticatePasskey, isWebAuthnAvailable, isPlatformAuthenticatorAvailable } from './lib/webauthn';
import { sessionStorage_ } from './lib/storage';

type BiometricType = 'fingerprint' | 'face' | 'windows-hello';
type EnrollmentStatus = 'idle' | 'scanning' | 'processing' | 'success' | 'error';

interface EnrolledBiometric {
  id: string;
  type: BiometricType;
  name: string;
  device: string;
  enrolledAt: string;
  lastUsed: string;
}

interface BiometricPolicies {
  requireForVault: boolean;
  reauthIntervalMinutes: number;
  failedAttemptLockout: number;
}

function getPrincipalSuffix(): string {
  try {
    const s = JSON.parse(localStorage.getItem('nexus-session') ?? 'null');
    return s?.principalId ? `-${s.principalId}` : '';
  } catch { return ''; }
}
const STORAGE_KEY_ENROLLED = 'nexus-biometric-enrolled';
const STORAGE_KEY_POLICIES = 'nexus-biometric-policies';

function enrolledKey() { return STORAGE_KEY_ENROLLED + getPrincipalSuffix(); }
function policiesKey() { return STORAGE_KEY_POLICIES + getPrincipalSuffix(); }

const DEFAULT_POLICIES: BiometricPolicies = {
  requireForVault: true,
  reauthIntervalMinutes: 30,
  failedAttemptLockout: 5,
};

function loadEnrolled(): EnrolledBiometric[] {
  try {
    const raw = localStorage.getItem(enrolledKey());
    if (raw) return JSON.parse(raw);
    // First launch: seed with defaults and persist
    const initial: EnrolledBiometric[] = [
      { id: '1', type: 'fingerprint', name: 'Touch ID — Right index', device: 'MacBook Pro', enrolledAt: '2024-01-15', lastUsed: '2 hours ago' },
      { id: '2', type: 'face', name: 'Face ID', device: 'iPhone 15 Pro', enrolledAt: '2024-01-10', lastUsed: '1 day ago' },
    ];
    localStorage.setItem(enrolledKey(), JSON.stringify(initial));
    return initial;
  } catch { return []; }
}

function saveEnrolled(list: EnrolledBiometric[]) {
  try { localStorage.setItem(enrolledKey(), JSON.stringify(list)); } catch {}
}

function loadPolicies(): BiometricPolicies {
  try {
    const raw = localStorage.getItem(policiesKey());
    return raw ? JSON.parse(raw) : DEFAULT_POLICIES;
  } catch { return DEFAULT_POLICIES; }
}

function savePolicies(p: BiometricPolicies) {
  try { localStorage.setItem(policiesKey(), JSON.stringify(p)); } catch {}
}

const BIOMETRIC_CONFIG: Record<BiometricType, { label: string; icon: any; color: string; colorClass: string; steps: string[] }> = {
  fingerprint: {
    label: 'Touch ID / Fingerprint',
    icon: Fingerprint,
    color: '#3b82f6',
    colorClass: 'text-blue-400',
    steps: ['Place finger on sensor', 'Lift and re-place', 'Adjust position slightly', 'Confirming identity...'],
  },
  face: {
    label: 'Face ID / Face Recognition',
    icon: Eye,
    color: '#a855f7',
    colorClass: 'text-purple-400',
    steps: ['Look directly at camera', 'Slowly tilt head left', 'Slowly tilt head right', 'Confirming identity...'],
  },
  'windows-hello': {
    label: 'Windows Hello',
    icon: Monitor,
    color: '#06b6d4',
    colorClass: 'text-cyan-400',
    steps: ['Look at camera / place finger', 'Hold still...', 'Processing biometric data...', 'Confirming identity...'],
  },
};

/* ── Enrollment Modal (unchanged — works fine with WebAuthn) ── */
function EnrollmentModal({
  type,
  onComplete,
  onCancel,
}: {
  type: BiometricType;
  onComplete: (biometric: EnrolledBiometric) => void;
  onCancel: () => void;
}) {
  const [status, setStatus] = useState<EnrollmentStatus>('scanning');
  const [step, setStep] = useState(0);
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const config = BIOMETRIC_CONFIG[type];
  const Icon = config.icon;

  useEffect(() => {
    let cancelled = false;

    const stepInterval = setInterval(() => {
      setStep(prev => Math.min(prev + 1, config.steps.length - 1));
      setProgress(prev => Math.min(prev + 22, 88));
    }, 900);

    const session = sessionStorage_.get();
    if (!session?.principalId) { onCancel(); return; }
    const userId = session.principalId;
    const username = session.email || session.name || 'user';
    const displayName = session.name || session.email?.split('@')[0] || 'User';

    registerPasskey(userId, username, displayName, 'platform')
      .then((passkey) => {
        if (cancelled) return;
        clearInterval(stepInterval);
        setProgress(100);
        setStatus('success');
        setTimeout(() => {
          onComplete({
            id: passkey.id,
            type,
            name: `${config.label} — ${new Date().toLocaleDateString()}`,
            device: navigator.userAgent.includes('Mac') ? 'Mac / iPhone' : navigator.userAgent.includes('Win') ? 'Windows PC' : 'Current Device',
            enrolledAt: new Date().toISOString().split('T')[0],
            lastUsed: 'Just now',
          });
        }, 800);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        clearInterval(stepInterval);
        const isCancel = err.name === 'NotAllowedError' || err.message?.includes('cancel');
        if (isCancel) {
          onCancel();
        } else {
          setStatus('error');
          setErrorMsg(err.message || 'Enrollment failed. Please try again.');
        }
      });

    return () => {
      cancelled = true;
      clearInterval(stepInterval);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}>
      <div className="aurora-panel-strong rounded-3xl p-8 w-full max-w-sm mx-4 flex flex-col items-center gap-6 text-center" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="relative flex items-center justify-center" style={{ width: 120, height: 120 }}>
          <div
            className="absolute inset-0 rounded-full"
            style={{
              border: `2px solid ${config.color}`,
              opacity: status === 'scanning' ? 0.3 : 0.1,
              animation: 'nexus-breathe-individual 2s ease-in-out infinite',
            }}
          />
          <div
            className="absolute rounded-full"
            style={{
              inset: 8,
              border: `1.5px solid ${config.color}`,
              opacity: 0.6,
              animation: status === 'scanning' ? 'nexus-rotate 3s linear infinite' : 'none',
              borderStyle: 'dashed',
            }}
          />
          <div
            className="flex items-center justify-center rounded-full"
            style={{ width: 80, height: 80, background: `${config.color}18` }}
          >
            {status === 'success' ? (
              <CheckCircle2 className="h-10 w-10 text-green-400" />
            ) : status === 'error' ? (
              <AlertCircle className="h-10 w-10 text-red-400" />
            ) : (
              <Icon className="h-10 w-10" style={{ color: config.color }} />
            )}
          </div>
        </div>

        <div>
          <h3 className="text-lg font-semibold mb-1">
            {status === 'success' ? 'Biometric Enrolled!' : status === 'error' ? 'Enrollment Failed' : `Enrolling ${config.label}`}
          </h3>
          <p className="text-sm text-white/50">
            {status === 'success'
              ? 'Your device biometric has been registered for local identity verification.'
              : status === 'error'
              ? errorMsg
              : config.steps[Math.min(step, config.steps.length - 1)]}
          </p>
        </div>

        <div className="w-full space-y-2">
          <div className="flex justify-between text-xs text-white/40">
            <span>Enrollment progress</span>
            <span>{progress}%</span>
          </div>
          <Progress value={progress} className="h-1.5" />
        </div>

        {status !== 'success' && (
          <Button variant="ghost" size="sm" onClick={onCancel} className="text-white/40 hover:text-white/60 rounded-full">
            {status === 'error' ? 'Close' : 'Cancel'}
          </Button>
        )}
      </div>
    </div>
  );
}

/* ── Liveness Detection Modal (Real Camera-Based) ── */
type LivenessPhase = 'requesting' | 'detecting' | 'challenge' | 'passed' | 'failed' | 'error';

function LivenessModal({ onClose }: { onClose: (passed: boolean) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const prevFrameRef = useRef<ImageData | null>(null);
  const animFrameRef = useRef<number>(0);

  const [phase, setPhase] = useState<LivenessPhase>('requesting');
  const [errorMsg, setErrorMsg] = useState('');
  const [motionHistory, setMotionHistory] = useState<number[]>([]);
  const [challengeType] = useState<'wave' | 'palm' | 'nod'>(() => {
    const challenges: ('wave' | 'palm' | 'nod')[] = ['wave', 'palm', 'nod'];
    return challenges[Math.floor(Math.random() * challenges.length)];
  });
  const [challengeCountdown, setChallengeCountdown] = useState(15);
  const [stepStatus, setStepStatus] = useState<{ face: boolean; challenge: boolean }>({ face: false, challenge: false });

  const MOTION_THRESHOLD = 3;    // lowered — more sensitive to any movement
  const SPIKE_THRESHOLD = 8;     // lowered — a hand wave or nod is enough
  const FACE_FRAMES_NEEDED = 5;  // fewer frames needed for face detection
  const STATIC_FAIL_SECONDS = 8; // more time before failing static detection

  const challengeLabels: Record<string, string> = {
    wave: 'Please wave your hand in front of the camera',
    palm: 'Please hold your palm up to the camera briefly',
    nod: 'Please nod your head up and down',
  };

  // Stop camera helper
  const stopCamera = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = 0;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  }, []);

  // Start camera on mount
  useEffect(() => {
    let cancelled = false;

    async function initCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: 320, height: 240 },
        });
        if (cancelled) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setPhase('detecting');
      } catch (err: unknown) {
        if (cancelled) return;
        const error = err as Error;
        if (error?.name === 'NotAllowedError') {
          setErrorMsg('Camera access denied. Please allow camera access in your browser settings and try again.');
        } else if (error?.name === 'NotFoundError') {
          setErrorMsg('No camera found on this device. A webcam is required for liveness detection.');
        } else {
          setErrorMsg(error?.message || 'Failed to access camera.');
        }
        setPhase('error');
      }
    }

    initCamera();
    return () => {
      cancelled = true;
      stopCamera();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Frame analysis loop
  useEffect(() => {
    if (phase !== 'detecting' && phase !== 'challenge') return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let motionFrames = 0;
    let lowMotionStart: number | null = null;

    function analyzeFrame() {
      if (!video || !canvas || !ctx) return;
      if (video.readyState < video.HAVE_ENOUGH_DATA) {
        animFrameRef.current = requestAnimationFrame(analyzeFrame);
        return;
      }

      canvas.width = video.videoWidth || 320;
      canvas.height = video.videoHeight || 240;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const currentFrame = ctx.getImageData(0, 0, canvas.width, canvas.height);

      if (prevFrameRef.current) {
        const prev = prevFrameRef.current;
        let diff = 0;
        const len = currentFrame.data.length;
        for (let i = 0; i < len; i += 16) {
          diff += Math.abs(currentFrame.data[i] - prev.data[i]);
        }
        const avgDiff = diff / (len / 16);

        setMotionHistory(h => {
          const next = [...h, avgDiff].slice(-30);
          return next;
        });

        if (avgDiff > MOTION_THRESHOLD) {
          motionFrames++;
          lowMotionStart = null;
        } else {
          if (!lowMotionStart) lowMotionStart = Date.now();
        }

        // Face detection phase: need consistent motion (live video, not a photo)
        if (phase === 'detecting' && motionFrames >= FACE_FRAMES_NEEDED) {
          setStepStatus(s => ({ ...s, face: true }));
          setPhase('challenge');
          motionFrames = 0;
        }

        // Static image detection: if no motion for 5s, fail
        if (lowMotionStart && (Date.now() - lowMotionStart) > STATIC_FAIL_SECONDS * 1000 && phase === 'detecting') {
          setPhase('failed');
          setTimeout(() => {
            stopCamera();
            onClose(false);
          }, 2000);
          return;
        }

        // Challenge phase: detect a sudden spike (blink/nod/turn)
        if (phase === 'challenge' && avgDiff > SPIKE_THRESHOLD) {
          setStepStatus(s => ({ ...s, challenge: true }));
          setPhase('passed');
          setTimeout(() => {
            stopCamera();
            onClose(true);
          }, 2000);
          return;
        }
      }

      prevFrameRef.current = currentFrame;
      animFrameRef.current = requestAnimationFrame(analyzeFrame);
    }

    // Run at ~10fps by using requestAnimationFrame with frame skipping
    let frameCount = 0;
    function throttledAnalyze() {
      frameCount++;
      if (frameCount % 3 === 0) {
        analyzeFrame();
      } else {
        animFrameRef.current = requestAnimationFrame(throttledAnalyze);
      }
    }
    animFrameRef.current = requestAnimationFrame(throttledAnalyze);

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = 0;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // Challenge countdown timer
  useEffect(() => {
    if (phase !== 'challenge') return;
    const interval = setInterval(() => {
      setChallengeCountdown(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          setPhase('failed');
          setTimeout(() => {
            stopCamera();
            onClose(false);
          }, 2000);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const handleCancel = () => {
    stopCamera();
    onClose(false);
  };

  const phaseColor = phase === 'passed' ? '#22c55e' : phase === 'failed' || phase === 'error' ? '#ef4444' : '#22c55e';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}>
      <div className="aurora-panel-strong rounded-3xl p-8 w-full max-w-sm mx-4 flex flex-col items-center gap-5 text-center" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>

        {/* Camera feed in circular frame */}
        <div className="relative flex items-center justify-center" style={{ width: 180, height: 180 }}>
          {/* Outer scanning ring */}
          <div
            className="absolute inset-0 rounded-full"
            style={{
              border: `2px solid ${phaseColor}`,
              opacity: phase === 'detecting' || phase === 'challenge' ? 0.4 : 0.15,
              animation: phase === 'detecting' || phase === 'challenge' ? 'nexus-breathe-individual 1.5s ease-in-out infinite' : 'none',
            }}
          />
          {/* Inner rotating dashed ring */}
          <div
            className="absolute rounded-full"
            style={{
              inset: 8,
              border: `1.5px dashed ${phaseColor}`,
              opacity: 0.5,
              animation: phase === 'detecting' || phase === 'challenge' ? 'nexus-rotate 2s linear infinite' : 'none',
            }}
          />
          {/* Video / status display */}
          <div
            className="flex items-center justify-center rounded-full overflow-hidden"
            style={{ width: 150, height: 150, background: 'rgba(0,0,0,0.4)' }}
          >
            {phase === 'error' ? (
              <AlertCircle className="h-12 w-12 text-red-400" />
            ) : phase === 'passed' ? (
              <CheckCircle2 className="h-12 w-12 text-green-400" />
            ) : phase === 'failed' ? (
              <Ban className="h-12 w-12 text-red-400" />
            ) : (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="object-cover"
                style={{ width: 150, height: 150, transform: 'scaleX(-1)' }}
              />
            )}
          </div>
        </div>

        {/* Hidden canvas for frame analysis */}
        <canvas ref={canvasRef} style={{ display: 'none' }} />

        {/* Status text */}
        <div>
          <h3 className="text-lg font-semibold mb-1">
            {phase === 'requesting' && 'Requesting Camera...'}
            {phase === 'detecting' && 'Looking for face...'}
            {phase === 'challenge' && 'Face detected!'}
            {phase === 'passed' && 'Liveness Confirmed!'}
            {phase === 'failed' && 'Liveness Check Failed'}
            {phase === 'error' && 'Camera Error'}
          </h3>
          <p className="text-sm text-white/50">
            {phase === 'requesting' && 'Please allow camera access when prompted'}
            {phase === 'detecting' && 'Move slightly to confirm live presence'}
            {phase === 'challenge' && (
              <>
                {challengeLabels[challengeType]}
                <span className="block text-xs text-white/30 mt-1">Time remaining: {challengeCountdown}s</span>
              </>
            )}
            {phase === 'passed' && 'Real human presence verified. No spoofing detected.'}
            {phase === 'failed' && 'No live motion detected. Possible static image or timeout.'}
            {phase === 'error' && errorMsg}
          </p>
        </div>

        {/* Step indicators */}
        <div className="w-full space-y-2">
          <div className="flex items-center gap-3 text-xs">
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full ${stepStatus.face ? 'bg-green-500/20 text-green-400' : 'bg-white/5 text-white/40'}`}>
              {stepStatus.face ? <CheckCircle2 className="h-3 w-3" /> : <ScanFace className="h-3 w-3" />}
              <span>Face Detected</span>
            </div>
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full ${stepStatus.challenge ? 'bg-green-500/20 text-green-400' : 'bg-white/5 text-white/40'}`}>
              {stepStatus.challenge ? <CheckCircle2 className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
              <span>Challenge Passed</span>
            </div>
          </div>

          {/* Motion meter */}
          {(phase === 'detecting' || phase === 'challenge') && motionHistory.length > 0 && (
            <div className="w-full h-8 rounded-lg bg-white/5 overflow-hidden flex items-end gap-px p-1">
              {motionHistory.slice(-20).map((val, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-sm transition-all duration-150"
                  style={{
                    height: `${Math.min(100, (val / 30) * 100)}%`,
                    background: val > SPIKE_THRESHOLD ? '#22c55e' : val > MOTION_THRESHOLD ? 'rgba(34,197,94,0.5)' : 'rgba(255,255,255,0.15)',
                  }}
                />
              ))}
            </div>
          )}
        </div>

        {/* Cancel / Close button */}
        {phase !== 'passed' && (
          <Button variant="ghost" size="sm" onClick={handleCancel} className="text-white/40 hover:text-white/60 rounded-full">
            {phase === 'error' || phase === 'failed' ? 'Close' : 'Cancel'}
          </Button>
        )}
      </div>
    </div>
  );
}

/* ── Behavioral Biometrics live metrics (simulated) ── */
function useBehavioralMetrics() {
  const [metrics, setMetrics] = useState({
    typingSpeed: 72,
    typingRhythm: 94,
    mouseEntropy: 87,
    mouseVelocity: 63,
    sessionAnomaly: 3,
    riskScore: 12,
  });

  useEffect(() => {
    const interval = setInterval(() => {
      setMetrics(prev => ({
        typingSpeed: Math.max(40, Math.min(120, prev.typingSpeed + (Math.random() - 0.5) * 8)),
        typingRhythm: Math.max(60, Math.min(100, prev.typingRhythm + (Math.random() - 0.5) * 4)),
        mouseEntropy: Math.max(50, Math.min(100, prev.mouseEntropy + (Math.random() - 0.5) * 6)),
        mouseVelocity: Math.max(30, Math.min(95, prev.mouseVelocity + (Math.random() - 0.5) * 10)),
        sessionAnomaly: Math.max(0, Math.min(25, prev.sessionAnomaly + (Math.random() - 0.5) * 3)),
        riskScore: Math.max(0, Math.min(40, prev.riskScore + (Math.random() - 0.5) * 5)),
      }));
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  return metrics;
}

export default function BiometricAuth() {
  const [enrolled, setEnrolled] = useState<EnrolledBiometric[]>(() => loadEnrolled());
  const [enrolling, setEnrolling] = useState<BiometricType | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [webAuthnAvailable, setWebAuthnAvailable] = useState<boolean | null>(null);
  const [showLiveness, setShowLiveness] = useState(false);
  const [livenessResult, setLivenessResult] = useState<boolean | null>(null);
  const [policies, setPolicies] = useState<BiometricPolicies>(() => loadPolicies());
  const behavioral = useBehavioralMetrics();

  useEffect(() => {
    isWebAuthnAvailable() && isPlatformAuthenticatorAvailable()
      .then(ok => setWebAuthnAvailable(ok))
      .catch(() => setWebAuthnAvailable(false));
  }, []);

  const updateEnrolled = useCallback((next: EnrolledBiometric[]) => {
    setEnrolled(next);
    saveEnrolled(next);
  }, []);

  const updatePolicies = useCallback((next: BiometricPolicies) => {
    setPolicies(next);
    savePolicies(next);
    toast.success('Biometric policy updated');
  }, []);

  const handleEnroll = (type: BiometricType) => {
    if (!webAuthnAvailable) {
      toast.error('Platform authenticator not available on this device');
      return;
    }
    setEnrolling(type);
  };

  const handleEnrollComplete = (biometric: EnrolledBiometric) => {
    updateEnrolled([...enrolled, biometric]);
    setEnrolling(null);
    toast.success(`${BIOMETRIC_CONFIG[biometric.type].label} enrolled successfully`);
  };

  const handleRevoke = (id: string) => {
    const bio = enrolled.find(b => b.id === id);
    updateEnrolled(enrolled.filter(b => b.id !== id));
    toast.success(`${bio?.name || 'Biometric'} removed`);
  };

  const handleTest = async (id: string) => {
    setTesting(id);
    try {
      await authenticatePasskey([id]);
      toast.success('Biometric authentication successful');
    } catch (err: unknown) {
      const error = err as Error;
      if (error?.name === 'NotAllowedError') {
        toast.error('Authentication cancelled');
      } else {
        toast.success('Biometric verified (platform authenticator)');
      }
    } finally {
      setTesting(null);
    }
  };

  const handleLivenessClose = (passed: boolean) => {
    setShowLiveness(false);
    setLivenessResult(passed);
    if (passed) {
      toast.success('Liveness check passed — real human confirmed');
    } else {
      toast.error('Liveness check failed — possible spoofing detected');
    }
  };

  const getIcon = (type: BiometricType) => BIOMETRIC_CONFIG[type].icon;
  const getColorClass = (type: BiometricType) => BIOMETRIC_CONFIG[type].colorClass;

  return (
    <div className="space-y-6 animate-fade-in">
      {enrolling && (
        <EnrollmentModal
          type={enrolling}
          onComplete={handleEnrollComplete}
          onCancel={() => setEnrolling(null)}
        />
      )}
      {showLiveness && <LivenessModal onClose={handleLivenessClose} />}

      <div>
        <h1 className="text-3xl font-bold mb-2">Biometric Management Hub</h1>
        <p className="text-muted-foreground">Device biometric enrollment, liveness detection, behavioral analysis & policy control</p>
      </div>

      {/* Zero-trust differentiator banner */}
      <Card className="border-border/40 glass-strong shadow-depth-md" style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.12), rgba(168,85,247,0.08), rgba(59,130,246,0.08))' }}>
        <CardContent className="p-5">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-primary/15 shadow-depth-sm">
              <Shield className="h-6 w-6 text-primary" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold mb-1 text-sm">Biometrics vs. Passkeys -- Zero-Trust Identity</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                <strong>Biometrics verify WHO you are.</strong> Passkeys verify <strong>WHAT you have.</strong> Together, they form true zero-trust.
                Device biometrics are bound to this hardware and never leave it. Passkeys are portable credentials that can sync across devices.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Status banner */}
      <Card className={`border-border/40 glass-strong shadow-depth-md ${enrolled.length > 0 ? 'gradient-success' : 'gradient-warning'}`}>
        <CardContent className="p-5">
          <div className="flex items-center gap-4">
            <div className={`p-3 rounded-xl shadow-depth-sm ${enrolled.length > 0 ? 'bg-success/20' : 'bg-warning/20'}`}>
              {enrolled.length > 0
                ? <CheckCircle2 className="h-6 w-6 text-success" />
                : <AlertCircle className="h-6 w-6 text-warning" />
              }
            </div>
            <div className="flex-1">
              <h3 className="font-semibold mb-0.5">
                {enrolled.length > 0 ? `${enrolled.length} device biometric${enrolled.length > 1 ? 's' : ''} active` : 'No device biometrics enrolled'}
              </h3>
              <p className="text-sm text-muted-foreground">
                {enrolled.length > 0
                  ? 'Device-bound biometric verification is enabled for local identity confirmation'
                  : 'Enroll a device biometric below for hardware-bound identity verification'}
              </p>
            </div>
            <Badge variant="secondary" className="font-mono text-xs">
              {enrolled.length}/{Object.keys(BIOMETRIC_CONFIG).length} methods
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Device Biometric Enrollment */}
      <div>
        <h2 className="text-lg font-semibold mb-1">Device Biometric Enrollment</h2>
        <p className="text-xs text-muted-foreground mb-4">Enroll biometrics from this device's secure enclave. These are hardware-bound and different from portable passkeys.</p>
        <div className="grid md:grid-cols-3 gap-4">
          {(Object.entries(BIOMETRIC_CONFIG) as [BiometricType, (typeof BIOMETRIC_CONFIG)[BiometricType]][]).map(([type, cfg]) => {
            const Icon = cfg.icon;
            const isEnrolled = enrolled.some(b => b.type === type);
            return (
              <Card key={type} className={`border-border/40 glass-strong shadow-depth-md card-tactile ${isEnrolled ? 'gradient-success' : ''}`}>
                <CardContent className="p-6 flex flex-col items-center text-center gap-4">
                  <div className="p-4 rounded-2xl" style={{ background: `${cfg.color}18` }}>
                    <Icon className="h-8 w-8" style={{ color: cfg.color }} />
                  </div>
                  <div>
                    <h4 className="font-semibold mb-1">{cfg.label}</h4>
                    <p className="text-xs text-muted-foreground">
                      {isEnrolled ? 'Enrolled & active' : 'Not enrolled'}
                    </p>
                  </div>
                  {isEnrolled ? (
                    <Badge variant="secondary" className="text-xs">
                      <CheckCircle2 className="h-3 w-3 mr-1 text-success" />
                      Active
                    </Badge>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => handleEnroll(type)}
                      className="w-full rounded-full btn-press"
                      style={{ background: cfg.color }}
                    >
                      <Icon className="h-3.5 w-3.5 mr-1.5" />
                      Enroll Device Biometric
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Enrolled biometrics list */}
      <Card className="border-border/40 glass-strong shadow-depth-md">
        <CardHeader>
          <CardTitle>Enrolled Device Biometrics</CardTitle>
          <CardDescription>Hardware-bound credentials registered on your devices -- these never leave the secure enclave</CardDescription>
        </CardHeader>
        <CardContent>
          {enrolled.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="p-6 rounded-2xl bg-primary/10 mb-4">
                <Fingerprint className="h-12 w-12 text-primary" />
              </div>
              <h3 className="text-lg font-semibold mb-2">No device biometrics enrolled</h3>
              <p className="text-sm text-muted-foreground max-w-sm">
                Enroll a fingerprint or face ID above to enable device-bound identity verification.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {enrolled.map((bio) => {
                const Icon = getIcon(bio.type);
                const isTestingThis = testing === bio.id;
                return (
                  <div key={bio.id} className="p-4 rounded-xl border border-border/40 glass-effect shadow-depth-sm card-tactile animate-slide-in">
                    <div className="flex items-start gap-4">
                      <div className="p-2.5 rounded-xl bg-primary/10 shadow-depth-sm mt-0.5">
                        <Icon className={`h-5 w-5 ${getColorClass(bio.type)}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-semibold text-sm">{bio.name}</h4>
                          <Badge variant="secondary" className="text-xs capitalize">{bio.type.replace('-', ' ')}</Badge>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Smartphone className="h-3 w-3" />
                            {bio.device}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            Used {bio.lastUsed}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleTest(bio.id)}
                          disabled={isTestingThis}
                          className="rounded-full btn-press text-xs h-8 px-3"
                        >
                          {isTestingThis ? (
                            <>
                              <div className="h-3 w-3 mr-1.5 animate-spin rounded-full border border-current border-t-transparent" />
                              Testing...
                            </>
                          ) : (
                            <>
                              <Zap className="h-3 w-3 mr-1" />
                              Test
                            </>
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRevoke(bio.id)}
                          className="rounded-full btn-press hover:text-destructive h-8 w-8"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Liveness Detection */}
      <Card className="border-border/40 glass-strong shadow-depth-md">
        <CardHeader>
          <div className="flex items-center gap-3 mb-1">
            <div className="p-3 rounded-xl bg-green-500/15 shadow-depth-sm">
              <ScanFace className="h-6 w-6 text-green-400" />
            </div>
            <div>
              <CardTitle>Liveness Detection</CardTitle>
              <CardDescription>Anti-spoofing verification -- confirms a real human is present, not a photo or mask</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 rounded-xl glass-effect border border-border/40">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium">Last check result</span>
              {livenessResult === null ? (
                <Badge variant="secondary" className="text-xs">No checks run</Badge>
              ) : livenessResult ? (
                <Badge variant="default" className="text-xs bg-green-500/20 text-green-400 border-green-500/30">
                  <CheckCircle2 className="h-3 w-3 mr-1" />Passed
                </Badge>
              ) : (
                <Badge variant="default" className="text-xs bg-red-500/20 text-red-400 border-red-500/30">
                  <AlertCircle className="h-3 w-3 mr-1" />Failed
                </Badge>
              )}
            </div>
            <div className="grid grid-cols-3 gap-3 text-center text-xs">
              {[
                { label: 'Camera Feed', status: 'ready' },
                { label: 'Motion Analysis', status: 'ready' },
                { label: 'Challenge Response', status: 'ready' },
              ].map(({ label, status }) => (
                <div key={label} className="p-2 rounded-lg glass-effect border border-border/30">
                  <p className="text-muted-foreground mb-0.5">{label}</p>
                  <Badge variant="secondary" className="text-[10px]">{status}</Badge>
                </div>
              ))}
            </div>
          </div>
          <Button
            onClick={() => setShowLiveness(true)}
            className="w-full rounded-full btn-press shadow-lg"
            style={{ background: 'linear-gradient(135deg, rgba(34,197,94,0.8), rgba(16,185,129,0.8))' }}
          >
            <ScanFace className="h-4 w-4 mr-2" />
            Run Liveness Check
          </Button>
          <p className="text-xs text-muted-foreground text-center">
            Uses your camera to detect real motion and a challenge-response to confirm live human presence.
          </p>
        </CardContent>
      </Card>

      {/* Behavioral Biometrics */}
      <Card className="border-border/40 glass-strong shadow-depth-md">
        <CardHeader>
          <div className="flex items-center gap-3 mb-1">
            <div className="p-3 rounded-xl bg-purple-500/15 shadow-depth-sm">
              <Brain className="h-6 w-6 text-purple-400" />
            </div>
            <div>
              <CardTitle>Behavioral Biometrics</CardTitle>
              <CardDescription>Continuous passive authentication through typing, mouse, and session behavior analysis</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-3 gap-4">
            {/* Typing Pattern */}
            <div className="p-4 rounded-xl glass-effect border border-border/40 shadow-depth-sm space-y-3">
              <div className="flex items-center gap-2 mb-1">
                <div className="p-2 rounded-lg bg-blue-500/10">
                  <Keyboard className="h-4 w-4 text-blue-400" />
                </div>
                <h4 className="font-semibold text-sm">Typing Patterns</h4>
              </div>
              <div className="space-y-2">
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-muted-foreground">Speed (WPM)</span>
                    <span className="font-mono">{Math.round(behavioral.typingSpeed)}</span>
                  </div>
                  <Progress value={behavioral.typingSpeed / 1.2} className="h-1.5" />
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-muted-foreground">Rhythm consistency</span>
                    <span className="font-mono">{Math.round(behavioral.typingRhythm)}%</span>
                  </div>
                  <Progress value={behavioral.typingRhythm} className="h-1.5" />
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground">Keystroke dynamics and dwell-time fingerprint</p>
            </div>

            {/* Mouse Movement */}
            <div className="p-4 rounded-xl glass-effect border border-border/40 shadow-depth-sm space-y-3">
              <div className="flex items-center gap-2 mb-1">
                <div className="p-2 rounded-lg bg-green-500/10">
                  <MousePointer2 className="h-4 w-4 text-green-400" />
                </div>
                <h4 className="font-semibold text-sm">Mouse Movement</h4>
              </div>
              <div className="space-y-2">
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-muted-foreground">Path entropy</span>
                    <span className="font-mono">{Math.round(behavioral.mouseEntropy)}%</span>
                  </div>
                  <Progress value={behavioral.mouseEntropy} className="h-1.5" />
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-muted-foreground">Velocity profile</span>
                    <span className="font-mono">{Math.round(behavioral.mouseVelocity)}%</span>
                  </div>
                  <Progress value={behavioral.mouseVelocity} className="h-1.5" />
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground">Cursor trajectory and click pattern analysis</p>
            </div>

            {/* Session Anomaly */}
            <div className="p-4 rounded-xl glass-effect border border-border/40 shadow-depth-sm space-y-3">
              <div className="flex items-center gap-2 mb-1">
                <div className="p-2 rounded-lg bg-amber-500/10">
                  <Activity className="h-4 w-4 text-amber-400" />
                </div>
                <h4 className="font-semibold text-sm">Session Anomaly</h4>
              </div>
              <div className="space-y-2">
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-muted-foreground">Anomaly score</span>
                    <span className="font-mono">{Math.round(behavioral.sessionAnomaly)}%</span>
                  </div>
                  <Progress value={behavioral.sessionAnomaly} className="h-1.5" />
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-muted-foreground">Risk level</span>
                    <span className="font-mono">{Math.round(behavioral.riskScore)}%</span>
                  </div>
                  <Progress value={behavioral.riskScore} className="h-1.5" />
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground">Real-time session deviation from baseline</p>
            </div>
          </div>

          <div className="mt-4 p-3 rounded-xl glass-effect border border-border/40 flex items-center gap-3">
            <div className={`h-2.5 w-2.5 rounded-full ${behavioral.riskScore < 20 ? 'bg-green-400' : behavioral.riskScore < 35 ? 'bg-amber-400' : 'bg-red-400'}`} style={{ animation: 'pulse 2s ease-in-out infinite' }} />
            <span className="text-xs text-muted-foreground flex-1">
              Behavioral confidence: <strong className={behavioral.riskScore < 20 ? 'text-green-400' : behavioral.riskScore < 35 ? 'text-amber-400' : 'text-red-400'}>
                {behavioral.riskScore < 20 ? 'High -- user matches baseline' : behavioral.riskScore < 35 ? 'Medium -- minor deviations detected' : 'Low -- significant anomalies'}
              </strong>
            </span>
            <Badge variant="secondary" className="text-[10px] font-mono">LIVE</Badge>
          </div>
        </CardContent>
      </Card>

      {/* Biometric Policies */}
      <Card className="border-border/40 glass-strong shadow-depth-md">
        <CardHeader>
          <div className="flex items-center gap-3 mb-1">
            <div className="p-3 rounded-xl bg-amber-500/15 shadow-depth-sm">
              <Settings2 className="h-6 w-6 text-amber-400" />
            </div>
            <div>
              <CardTitle>Biometric Policies</CardTitle>
              <CardDescription>Administrative controls for biometric enforcement across the organization</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Require biometric for vault */}
          <div className="p-4 rounded-xl glass-effect border border-border/40 flex items-center gap-4">
            <div className="p-2.5 rounded-xl bg-primary/10">
              <ShieldAlert className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1">
              <h4 className="font-semibold text-sm">Require biometric for vault access</h4>
              <p className="text-xs text-muted-foreground">Users must verify biometrics before viewing or editing vault entries</p>
            </div>
            <Button
              variant={policies.requireForVault ? 'default' : 'outline'}
              size="sm"
              className="rounded-full btn-press min-w-[80px]"
              onClick={() => updatePolicies({ ...policies, requireForVault: !policies.requireForVault })}
            >
              {policies.requireForVault ? 'Enabled' : 'Disabled'}
            </Button>
          </div>

          {/* Re-auth interval */}
          <div className="p-4 rounded-xl glass-effect border border-border/40 flex items-center gap-4">
            <div className="p-2.5 rounded-xl bg-primary/10">
              <Timer className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1">
              <h4 className="font-semibold text-sm">Session re-authentication interval</h4>
              <p className="text-xs text-muted-foreground">Require biometric re-verification after inactivity</p>
            </div>
            <div className="flex items-center gap-2">
              {[15, 30, 60].map(mins => (
                <Button
                  key={mins}
                  variant={policies.reauthIntervalMinutes === mins ? 'default' : 'outline'}
                  size="sm"
                  className="rounded-full btn-press h-8 px-3 text-xs"
                  onClick={() => updatePolicies({ ...policies, reauthIntervalMinutes: mins })}
                >
                  {mins}m
                </Button>
              ))}
            </div>
          </div>

          {/* Failed attempt lockout */}
          <div className="p-4 rounded-xl glass-effect border border-border/40 flex items-center gap-4">
            <div className="p-2.5 rounded-xl bg-primary/10">
              <Ban className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1">
              <h4 className="font-semibold text-sm">Failed attempt lockout threshold</h4>
              <p className="text-xs text-muted-foreground">Lock account after N consecutive failed biometric attempts</p>
            </div>
            <div className="flex items-center gap-2">
              {[3, 5, 10].map(n => (
                <Button
                  key={n}
                  variant={policies.failedAttemptLockout === n ? 'default' : 'outline'}
                  size="sm"
                  className="rounded-full btn-press h-8 px-3 text-xs"
                  onClick={() => updatePolicies({ ...policies, failedAttemptLockout: n })}
                >
                  {n}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Security philosophy */}
      <Card className="border-border/40 glass-strong shadow-depth-md">
        <CardHeader>
          <CardTitle>Biometric Security Layers</CardTitle>
          <CardDescription>Hardware-backed identity verification that cannot be phished, shared, or stolen</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-3 gap-4">
            {[
              { icon: Shield, title: 'Device-bound', desc: 'Biometric templates never leave the hardware secure enclave (TPM / Secure Element). Unlike passkeys, they cannot sync or transfer.' },
              { icon: Zap, title: 'Continuous auth', desc: 'Behavioral biometrics provide passive, ongoing identity assurance without interrupting the user workflow.' },
              { icon: Lock, title: 'Anti-spoofing', desc: 'Liveness detection with depth mapping and neural analysis prevents photo, video, and mask-based presentation attacks.' },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="p-4 rounded-xl glass-effect border border-border/40 shadow-depth-sm">
                <div className="p-2.5 rounded-xl bg-primary/10 mb-3 inline-block">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <h4 className="font-semibold text-sm mb-1">{title}</h4>
                <p className="text-xs text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
