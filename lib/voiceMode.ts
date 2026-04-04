/**
 * lib/voiceMode.ts — Browser-native voice mode using Speech Recognition & Speech Synthesis.
 *
 * No external services needed. All processing stays on-device.
 * Works in Chrome, Edge, Safari (desktop and mobile).
 */

import { loadPasskeys } from './webauthn';
import { vaultStorage, userRegistry, sessionStorage_ } from './storage';

/* ── Types ──────────────────────────────────────────────────────────────── */

export interface VoiceContext {
  principalId: string;
  email: string;
  role: string;
  navigate: (view: string) => void;
}

export interface VoiceCommand {
  pattern: RegExp;
  action: string;
  handler: (matches: RegExpMatchArray, context: VoiceContext) => Promise<string>;
}

type ResultCallback = (transcript: string, isFinal: boolean) => void;
type ErrorCallback = (error: string) => void;

/* ── SpeechRecognition polyfill ─────────────────────────────────────────── */

const SpeechRecognitionAPI =
  typeof window !== 'undefined'
    ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    : null;

export function isSpeechSupported(): boolean {
  return SpeechRecognitionAPI != null;
}

export function isSynthesisSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/* ── Recognition singleton ──────────────────────────────────────────────── */

let recognition: any = null;
let isListening = false;

export function startListening(
  onResult: ResultCallback,
  onError: ErrorCallback,
): void {
  if (!SpeechRecognitionAPI) {
    onError('Speech Recognition is not supported in this browser.');
    return;
  }

  if (isListening && recognition) {
    recognition.stop();
  }

  recognition = new SpeechRecognitionAPI();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = 'en-US';
  recognition.maxAlternatives = 1;

  recognition.onresult = (event: any) => {
    let finalTranscript = '';
    let interimTranscript = '';

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      if (result.isFinal) {
        finalTranscript += result[0].transcript;
      } else {
        interimTranscript += result[0].transcript;
      }
    }

    if (finalTranscript) {
      onResult(finalTranscript.trim(), true);
    } else if (interimTranscript) {
      onResult(interimTranscript.trim(), false);
    }
  };

  recognition.onerror = (event: any) => {
    if (event.error === 'no-speech') return; // Ignore silence
    if (event.error === 'aborted') return;   // Intentional stop
    onError(`Speech error: ${event.error}`);
  };

  recognition.onend = () => {
    isListening = false;
  };

  try {
    recognition.start();
    isListening = true;
  } catch {
    onError('Failed to start speech recognition. Check microphone permissions.');
  }
}

export function stopListening(): void {
  if (recognition) {
    try { recognition.stop(); } catch { /* already stopped */ }
    isListening = false;
  }
}

export function getIsListening(): boolean {
  return isListening;
}

/* ── Speech Synthesis ───────────────────────────────────────────────────── */

let currentUtterance: SpeechSynthesisUtterance | null = null;

export function speak(text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!isSynthesisSupported()) {
      resolve();
      return;
    }

    // Cancel any ongoing speech
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.05;
    utterance.pitch = 1.0;
    utterance.volume = 0.9;

    // Prefer a natural-sounding voice
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find(
      v => v.lang.startsWith('en') && (v.name.includes('Samantha') || v.name.includes('Google') || v.name.includes('Natural')),
    ) ?? voices.find(v => v.lang.startsWith('en'));
    if (preferred) utterance.voice = preferred;

    utterance.onend = () => {
      currentUtterance = null;
      resolve();
    };
    utterance.onerror = () => {
      currentUtterance = null;
      resolve(); // Don't reject — voice failure is non-critical
    };

    currentUtterance = utterance;
    window.speechSynthesis.speak(utterance);
  });
}

export function stopSpeaking(): void {
  if (isSynthesisSupported()) {
    window.speechSynthesis.cancel();
    currentUtterance = null;
  }
}

export function isSpeaking(): boolean {
  return isSynthesisSupported() && window.speechSynthesis.speaking;
}

/* ── Voice Commands ─────────────────────────────────────────────────────── */

const COMMANDS: VoiceCommand[] = [
  {
    pattern: /(?:what(?:'s| is) my )?security score/i,
    action: 'check_score',
    handler: async (_m, _ctx) => {
      // Read from the dashboard data in localStorage
      const session = sessionStorage_.get();
      const passkeys = session ? loadPasskeys(session.principalId) : [];
      const vault = vaultStorage.getRaw();
      // Compute a simple score based on passkeys + vault entries
      let score = 40; // base
      if (passkeys.length > 0) score += 25;
      if (passkeys.length >= 2) score += 10;
      if (vault.length > 0) score += 15;
      if (vault.length >= 5) score += 10;
      score = Math.min(score, 100);
      return `Your current security score is ${score} out of 100. ${score >= 80 ? 'Great job, your account is well protected.' : score >= 50 ? 'There is room for improvement. Consider adding more passkeys or vault entries.' : 'Your account needs attention. I recommend setting up passkeys and adding credentials to the vault.'}`;
    },
  },
  {
    pattern: /show (?:me )?(?:the )?vault/i,
    action: 'navigate_vault',
    handler: async (_m, ctx) => {
      ctx.navigate('vault');
      return 'Opening the vault for you.';
    },
  },
  {
    pattern: /how many passkeys/i,
    action: 'count_passkeys',
    handler: async (_m, ctx) => {
      const passkeys = loadPasskeys(ctx.principalId);
      const count = passkeys.length;
      if (count === 0) return 'You don\'t have any passkeys registered yet. Go to the Passkeys page to set one up.';
      return `You have ${count} passkey${count !== 1 ? 's' : ''} registered.`;
    },
  },
  {
    pattern: /lock (?:the )?vault/i,
    action: 'lock_vault',
    handler: async (_m, ctx) => {
      ctx.navigate('vault');
      // The vault auto-locks when navigated to (requires unlock gate)
      return 'The vault has been locked. You will need to re-authenticate to access it.';
    },
  },
  {
    pattern: /run (?:a )?threat scan/i,
    action: 'navigate_threats',
    handler: async (_m, ctx) => {
      ctx.navigate('threat');
      return 'Opening the threat analysis page. A scan will start automatically.';
    },
  },
  {
    pattern: /show (?:the )?admin (?:dashboard|panel)?/i,
    action: 'navigate_admin',
    handler: async (_m, ctx) => {
      if (ctx.role !== 'admin') {
        return 'You need admin privileges to access the admin dashboard.';
      }
      ctx.navigate('admin');
      return 'Opening the admin dashboard.';
    },
  },
  {
    pattern: /who(?:'s| is) online/i,
    action: 'check_sessions',
    handler: async (_m, ctx) => {
      if (ctx.role !== 'admin') {
        return 'Only admins can view active sessions. Ask your administrator for this information.';
      }
      const users = userRegistry.getAll();
      const active = users.filter(u => u.isActive);
      return `There ${active.length === 1 ? 'is' : 'are'} ${active.length} active user${active.length !== 1 ? 's' : ''} online right now.`;
    },
  },
  {
    pattern: /suspend\s+(.+)/i,
    action: 'suspend_account',
    handler: async (matches, ctx) => {
      if (ctx.role !== 'admin') {
        return 'Only admins can suspend accounts.';
      }
      const targetName = matches[1].trim().replace(/[.!?]+$/, '');
      const users = userRegistry.getAll();
      const target = users.find(
        u => u.name.toLowerCase().includes(targetName.toLowerCase()) ||
             u.email.toLowerCase().includes(targetName.toLowerCase()),
      );
      if (!target) {
        return `I couldn't find an account matching "${targetName}". Please check the name and try again.`;
      }
      // Return a confirmation prompt — actual suspension handled by the UI
      return `CONFIRM: Suspend the account for ${target.name} (${target.email})? Say "yes" to confirm or "cancel" to abort.`;
    },
  },
  {
    pattern: /(?:what are my )?pending approvals/i,
    action: 'check_approvals',
    handler: async (_m, ctx) => {
      if (ctx.role !== 'admin') {
        return 'Only admins can view the approval queue.';
      }
      // Check for AI agent approval items in localStorage
      const raw = localStorage.getItem('nexus-agent-approvals');
      const approvals = raw ? JSON.parse(raw) : [];
      const pending = approvals.filter((a: any) => a.status === 'pending');
      if (pending.length === 0) {
        return 'You have no pending approvals. All clear.';
      }
      return `You have ${pending.length} pending approval${pending.length !== 1 ? 's' : ''} in the AI agent queue. Navigate to the admin dashboard to review them.`;
    },
  },
  {
    pattern: /^(?:help|what can you do|commands)$/i,
    action: 'help',
    handler: async () => {
      return 'Here are the commands I understand: ' +
        '"What\'s my security score?" to check your score. ' +
        '"Show me the vault" to open the vault. ' +
        '"How many passkeys do I have?" to count passkeys. ' +
        '"Lock the vault" to lock it. ' +
        '"Run a threat scan" to scan for threats. ' +
        '"Show admin dashboard" for admin access. ' +
        '"Who\'s online?" to check active sessions. ' +
        '"Suspend" followed by a name to suspend an account. ' +
        '"What are my pending approvals?" to check the approval queue.';
    },
  },
];

// Confirmation state for destructive actions
let pendingConfirmation: {
  action: string;
  context: VoiceContext;
  data: any;
} | null = null;

export async function processCommand(
  transcript: string,
  context: VoiceContext,
): Promise<string> {
  const cleaned = transcript.trim();

  // Handle yes/no confirmations
  if (pendingConfirmation) {
    const lower = cleaned.toLowerCase();
    if (lower === 'yes' || lower === 'confirm' || lower === 'do it') {
      const { action, data } = pendingConfirmation;
      pendingConfirmation = null;
      if (action === 'suspend_account' && data?.target) {
        // Perform the suspension
        const users = userRegistry.getAll();
        const target = users.find((u: any) => u.principalId === data.target.principalId);
        if (target) {
          target.isActive = false;
          userRegistry.updateUser(target.principalId, { isActive: false });
          return `Account for ${target.name} has been suspended.`;
        }
      }
      return 'Action confirmed.';
    }
    if (lower === 'no' || lower === 'cancel' || lower === 'abort') {
      pendingConfirmation = null;
      return 'Action cancelled.';
    }
  }

  // Match against commands
  for (const cmd of COMMANDS) {
    const match = cleaned.match(cmd.pattern);
    if (match) {
      const response = await cmd.handler(match, context);

      // Track confirmation-required actions
      if (response.startsWith('CONFIRM:')) {
        if (cmd.action === 'suspend_account') {
          const users = userRegistry.getAll();
          const targetName = match[1]?.trim().replace(/[.!?]+$/, '');
          const target = users.find(
            u => u.name.toLowerCase().includes(targetName?.toLowerCase() ?? '') ||
                 u.email.toLowerCase().includes(targetName?.toLowerCase() ?? ''),
          );
          pendingConfirmation = { action: cmd.action, context, data: { target } };
        }
        return response.replace('CONFIRM: ', '');
      }

      return response;
    }
  }

  return `I didn't understand "${cleaned}". Say "help" to hear the list of available commands.`;
}
