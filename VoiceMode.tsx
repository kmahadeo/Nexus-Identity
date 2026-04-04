/**
 * VoiceMode.tsx — Floating voice button for hands-free control.
 *
 * Uses browser-native Speech Recognition & Speech Synthesis.
 * No data leaves the device.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, MicOff, Volume2, Loader2, X, HelpCircle } from 'lucide-react';
import {
  startListening,
  stopListening,
  speak,
  stopSpeaking,
  processCommand,
  isSpeechSupported,
  isSynthesisSupported,
  isSpeaking,
  type VoiceContext,
} from './lib/voiceMode';

type VoiceState = 'idle' | 'listening' | 'processing' | 'speaking';

interface VoiceModeProps {
  context: VoiceContext;
}

export default function VoiceMode({ context }: VoiceModeProps) {
  const [state, setState] = useState<VoiceState>('idle');
  const [transcript, setTranscript] = useState('');
  const [response, setResponse] = useState('');
  const [error, setError] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSpeechRef = useRef<number>(Date.now());
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-stop after 5 seconds of silence
  const resetSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    lastSpeechRef.current = Date.now();
    silenceTimerRef.current = setTimeout(() => {
      if (state === 'listening') {
        handleStop();
      }
    }, 5000);
  }, [state]);

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearSilenceTimer();
      stopListening();
      stopSpeaking();
    };
  }, [clearSilenceTimer]);

  const handleStart = useCallback(() => {
    setError('');
    setTranscript('');
    setResponse('');
    setState('listening');
    setIsExpanded(true);

    startListening(
      (text, isFinal) => {
        setTranscript(text);
        resetSilenceTimer();

        if (isFinal) {
          // Process the final transcript
          clearSilenceTimer();
          setState('processing');

          processCommand(text, context).then(async (result) => {
            setResponse(result);
            setState('speaking');

            if (isSynthesisSupported()) {
              await speak(result);
            }

            setState('idle');
            // Keep expanded for a bit so user can read the response
            setTimeout(() => {
              if (!isSpeaking()) {
                // Don't auto-collapse, let user dismiss
              }
            }, 3000);
          });
        }
      },
      (err) => {
        setError(err);
        setState('idle');
        clearSilenceTimer();
      },
    );

    resetSilenceTimer();
  }, [context, resetSilenceTimer, clearSilenceTimer]);

  const handleStop = useCallback(() => {
    stopListening();
    stopSpeaking();
    clearSilenceTimer();

    if (state === 'listening' && transcript) {
      // Process whatever we have
      setState('processing');
      processCommand(transcript, context).then(async (result) => {
        setResponse(result);
        setState('speaking');

        if (isSynthesisSupported()) {
          await speak(result);
        }

        setState('idle');
      });
    } else {
      setState('idle');
    }
  }, [state, transcript, context, clearSilenceTimer]);

  const handleDismiss = useCallback(() => {
    stopListening();
    stopSpeaking();
    clearSilenceTimer();
    setState('idle');
    setIsExpanded(false);
    setTranscript('');
    setResponse('');
    setError('');
  }, [clearSilenceTimer]);

  if (!isSpeechSupported()) return null;

  return (
    <div
      ref={containerRef}
      className="fixed z-50 transition-all duration-300"
      style={{
        bottom: '20px',
        right: '16px',
      }}
    >
      {/* Expanded panel */}
      {isExpanded && (
        <div
          className="mb-3 rounded-2xl overflow-hidden animate-scale-in"
          style={{
            width: 'min(340px, calc(100vw - 48px))',
            background: 'rgba(8, 8, 20, 0.95)',
            backdropFilter: 'blur(24px) saturate(180%)',
            WebkitBackdropFilter: 'blur(24px) saturate(180%)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.05)',
          }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-4 py-3"
            style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}
          >
            <div className="flex items-center gap-2">
              <div className="relative">
                <Mic className="h-4 w-4 text-white/70" />
                {state === 'listening' && (
                  <div className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                )}
              </div>
              <span className="text-xs font-medium text-white/70 tracking-wide uppercase font-mono">
                {state === 'idle' && 'Voice Mode'}
                {state === 'listening' && 'Listening...'}
                {state === 'processing' && 'Processing...'}
                {state === 'speaking' && 'Speaking'}
              </span>
            </div>
            <button
              onClick={handleDismiss}
              className="p-1 rounded-full text-white/30 hover:text-white/60 hover:bg-white/[0.06] transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Content */}
          <div className="px-4 py-3 space-y-3 max-h-[280px] overflow-y-auto scrollbar-hide">
            {/* Waveform bars during listening */}
            {state === 'listening' && (
              <div className="flex items-center justify-center gap-1 py-2">
                {[...Array(5)].map((_, i) => (
                  <div
                    key={i}
                    className="w-1 rounded-full bg-gradient-to-t from-violet-500 to-cyan-400"
                    style={{
                      animation: `voice-bar 0.8s ease-in-out ${i * 0.1}s infinite alternate`,
                      height: '8px',
                    }}
                  />
                ))}
              </div>
            )}

            {/* Processing indicator */}
            {state === 'processing' && (
              <div className="flex items-center justify-center py-3">
                <Loader2 className="h-5 w-5 text-violet-400 animate-spin" />
              </div>
            )}

            {/* Live transcript */}
            {transcript && (
              <div>
                <p className="text-[10px] text-white/30 font-mono uppercase tracking-wider mb-1">You said</p>
                <p className="text-sm text-white/80 leading-relaxed">
                  {transcript}
                  {state === 'listening' && (
                    <span className="inline-block w-0.5 h-4 bg-violet-400 ml-0.5 align-middle animate-pulse" />
                  )}
                </p>
              </div>
            )}

            {/* Response */}
            {response && (
              <div
                className="rounded-xl px-3 py-2.5"
                style={{
                  background: 'rgba(167, 139, 250, 0.08)',
                  border: '1px solid rgba(167, 139, 250, 0.15)',
                }}
              >
                <div className="flex items-start gap-2">
                  {state === 'speaking' && (
                    <Volume2 className="h-3.5 w-3.5 text-violet-400 mt-0.5 shrink-0 animate-pulse" />
                  )}
                  <p className="text-sm text-white/70 leading-relaxed">{response}</p>
                </div>
              </div>
            )}

            {/* Error */}
            {error && (
              <div
                className="rounded-xl px-3 py-2.5"
                style={{
                  background: 'rgba(239, 68, 68, 0.08)',
                  border: '1px solid rgba(239, 68, 68, 0.15)',
                }}
              >
                <p className="text-xs text-red-400">{error}</p>
              </div>
            )}

            {/* Help hint when idle and no response */}
            {state === 'idle' && !response && !transcript && (
              <div className="flex items-center gap-2 py-1">
                <HelpCircle className="h-3.5 w-3.5 text-white/20 shrink-0" />
                <p className="text-xs text-white/30">
                  Tap the mic and say a command. Try "help" for a list.
                </p>
              </div>
            )}
          </div>

          {/* Footer hint */}
          <div
            className="px-4 py-2 text-center"
            style={{ borderTop: '1px solid rgba(255, 255, 255, 0.04)' }}
          >
            <p className="text-[10px] text-white/20 font-mono">
              Speech processed locally — no data leaves your device
            </p>
          </div>
        </div>
      )}

      {/* Floating mic button */}
      <button
        onClick={() => {
          if (state === 'listening') {
            handleStop();
          } else if (state === 'idle' || state === 'speaking') {
            handleStart();
          }
        }}
        className={`
          relative flex items-center justify-center rounded-full transition-all duration-300 btn-press
          ${state === 'listening'
            ? 'h-14 w-14 shadow-lg shadow-violet-500/25'
            : 'h-12 w-12 hover:scale-105'
          }
        `}
        style={{
          background: state === 'listening'
            ? 'linear-gradient(135deg, rgba(167, 139, 250, 0.9), rgba(34, 211, 238, 0.7))'
            : 'rgba(255, 255, 255, 0.08)',
          border: `1px solid ${state === 'listening' ? 'rgba(167, 139, 250, 0.5)' : 'rgba(255, 255, 255, 0.1)'}`,
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
        }}
        title={state === 'listening' ? 'Stop listening' : 'Start voice mode'}
        aria-label={state === 'listening' ? 'Stop listening' : 'Start voice mode'}
      >
        {/* Pulse ring when listening */}
        {state === 'listening' && (
          <>
            <div
              className="absolute inset-0 rounded-full animate-ping"
              style={{
                background: 'rgba(167, 139, 250, 0.15)',
                animationDuration: '1.5s',
              }}
            />
            <div
              className="absolute inset-[-4px] rounded-full"
              style={{
                background: 'transparent',
                border: '2px solid rgba(167, 139, 250, 0.3)',
                animation: 'voice-pulse 2s ease-in-out infinite',
              }}
            />
          </>
        )}

        {state === 'processing' ? (
          <Loader2 className="h-5 w-5 text-violet-400 animate-spin" />
        ) : state === 'listening' ? (
          <MicOff className="h-5 w-5 text-white" />
        ) : (
          <Mic className={`h-5 w-5 ${isExpanded ? 'text-violet-400' : 'text-white/60'}`} />
        )}
      </button>

      {/* Inline CSS for voice-specific animations */}
      <style>{`
        @keyframes voice-bar {
          0% { height: 8px; }
          100% { height: 24px; }
        }
        @keyframes voice-pulse {
          0%, 100% { transform: scale(1); opacity: 0.5; }
          50% { transform: scale(1.15); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
