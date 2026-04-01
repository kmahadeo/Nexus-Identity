/**
 * HelpRequestDialog.tsx — In-app support ticket submission (Option C).
 *
 * Stores ticket in localStorage + sends email stub to admin.
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { X, HelpCircle, Send, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { sessionStorage_ } from './lib/storage';
import {
  helpRequestStorage, sendHelpRequestEmail,
  HELP_CATEGORIES, HELP_PRIORITIES,
  type HelpRequestCategory, type HelpRequestPriority,
} from './lib/helpRequests';

interface Props {
  onClose: () => void;
}

export default function HelpRequestDialog({ onClose }: Props) {
  const session = sessionStorage_.get();

  const [subject, setSubject]       = useState('');
  const [message, setMessage]       = useState('');
  const [category, setCategory]     = useState<HelpRequestCategory>('onboarding');
  const [priority, setPriority]     = useState<HelpRequestPriority>('medium');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted]   = useState(false);

  const submit = async () => {
    if (!subject.trim()) { toast.error('Please enter a subject'); return; }
    if (!message.trim()) { toast.error('Please describe your issue'); return; }
    if (!session)        { toast.error('You must be signed in'); return; }

    setSubmitting(true);
    try {
      const req = helpRequestStorage.add({
        subject: subject.trim(),
        message: message.trim(),
        category,
        priority,
        requesterPrincipalId: session.principalId,
        requesterEmail: session.email,
        requesterName: session.name,
      });

      // Fire-and-forget email stub
      sendHelpRequestEmail(req).catch(() => {});

      setSubmitted(true);
    } catch {
      toast.error('Failed to submit — please try again');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-md rounded-2xl animate-fade-in"
        style={{
          background: 'linear-gradient(135deg, rgba(15,15,28,0.99) 0%, rgba(8,8,18,0.99) 100%)',
          border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '0 24px 48px rgba(0,0,0,0.5)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-violet-400/10"><HelpCircle className="h-4 w-4 text-violet-400" /></div>
            <div>
              <p className="text-sm font-semibold text-white/90">Get Help</p>
              <p className="text-xs text-white/30">We usually respond within 24 hours</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md text-white/25 hover:text-white/60 hover:bg-white/[0.05] transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {submitted ? (
          /* Success state */
          <div className="p-8 text-center">
            <div className="w-14 h-14 rounded-full bg-emerald-400/10 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="h-7 w-7 text-emerald-400" />
            </div>
            <h3 className="text-base font-semibold text-white/90 mb-2">Ticket submitted!</h3>
            <p className="text-sm text-white/40 mb-5">
              Your request has been logged. The Nexus team has been notified and will follow up at <span className="text-violet-400">{session?.email}</span>.
            </p>
            <Button onClick={onClose} className="rounded-full btn-press w-full" variant="outline">
              Close
            </Button>
          </div>
        ) : (
          /* Form */
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-white/50">Category</Label>
                <Select value={category} onValueChange={v => setCategory(v as HelpRequestCategory)}>
                  <SelectTrigger className="glass-effect text-sm h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(HELP_CATEGORIES).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-white/50">Priority</Label>
                <Select value={priority} onValueChange={v => setPriority(v as HelpRequestPriority)}>
                  <SelectTrigger className="glass-effect text-sm h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(HELP_PRIORITIES).map(([k, v]) => (
                      <SelectItem key={k} value={k}>
                        <span className={v.color}>{v.label}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-white/50">Subject</Label>
              <Input
                placeholder="Brief description of your issue"
                value={subject}
                onChange={e => setSubject(e.target.value)}
                className="glass-effect text-sm"
                maxLength={120}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-white/50">Details</Label>
              <textarea
                placeholder="Describe what you need help with. Include any error messages, steps to reproduce, or questions about onboarding."
                value={message}
                onChange={e => setMessage(e.target.value)}
                rows={5}
                className="w-full rounded-xl px-3 py-2.5 text-sm glass-effect border border-border/40 bg-transparent text-white/80 placeholder:text-white/20 resize-none focus:outline-none focus:ring-1 focus:ring-violet-400/40"
                maxLength={2000}
              />
              <p className="text-xs text-white/20 text-right">{message.length}/2000</p>
            </div>

            {session && (
              <div className="p-2.5 rounded-lg glass-effect text-xs text-white/30 flex items-center gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                Sending as {session.name} ({session.email})
              </div>
            )}

            <Button
              onClick={submit}
              disabled={submitting || !subject.trim() || !message.trim()}
              className="w-full rounded-full btn-press"
              style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.9), rgba(167,139,250,0.8))', border: 'none' }}
            >
              {submitting
                ? <><div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />Submitting…</>
                : <><Send className="h-4 w-4 mr-2" />Submit request</>
              }
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
