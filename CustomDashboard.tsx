import { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  LayoutGrid, Pin, PinOff, ExternalLink, Plus, Sparkles,
  Shield, Target, Brain, Key, Lock, Eye, Users, Plug, Settings, Network,
} from 'lucide-react';

/* ── Pinned section types ──────────────────────────────────────────────── */

export interface PinnedSection {
  id: string;
  label: string;
  sourceView: string;
  sectionId: string;
  order: number;
  description?: string;
  icon?: string;
}

/* ── Available sections catalogue ──────────────────────────────────────── */

export const AVAILABLE_SECTIONS: Omit<PinnedSection, 'order'>[] = [
  // SecurityDashboard
  { id: 'security-score',  label: 'Security Score',       sourceView: 'dashboard', sectionId: 'section-security-score',  description: 'Overall security posture score',        icon: 'shield' },
  { id: 'quick-actions',   label: 'Quick Actions',        sourceView: 'dashboard', sectionId: 'section-quick-actions',   description: 'Priority security actions',              icon: 'sparkles' },
  // ThreatAnalysis
  { id: 'threat-feed',     label: 'Active Threats',       sourceView: 'threat',    sectionId: 'section-threat-feed',     description: 'Live threat intelligence feed',          icon: 'target' },
  { id: 'risk-score',      label: 'Risk Score',           sourceView: 'threat',    sectionId: 'section-risk-score',      description: 'Aggregate risk score',                   icon: 'target' },
  // AdminIntelligence
  { id: 'admin-users',     label: 'User Management',      sourceView: 'admin',     sectionId: 'section-users',           description: 'Directory, roles, and compliance',       icon: 'users' },
  { id: 'admin-policies',  label: 'Security Policies',    sourceView: 'admin',     sectionId: 'section-policies',        description: 'Organisation-wide security policies',    icon: 'brain' },
  { id: 'admin-directory',  label: 'Directory Sync',      sourceView: 'admin',     sectionId: 'section-directory-sync',  description: 'SCIM directory & identity sync',         icon: 'network' },
  { id: 'admin-hardware',  label: 'Hardware Keys',        sourceView: 'admin',     sectionId: 'section-hardware-keys',   description: 'FIDO2/U2F key inventory',                icon: 'key' },
  { id: 'admin-sessions',  label: 'Session Management',   sourceView: 'admin',     sectionId: 'section-sessions',        description: 'Active sessions across organisation',    icon: 'eye' },
  { id: 'admin-reports',   label: 'Protected Reports',    sourceView: 'admin',     sectionId: 'section-reports',         description: 'MFA-gated compliance reports',            icon: 'lock' },
  { id: 'admin-support',   label: 'Support Tickets',      sourceView: 'admin',     sectionId: 'section-support',         description: 'User-submitted help requests',           icon: 'settings' },
];

/* ── Storage helpers ───────────────────────────────────────────────────── */

const STORAGE_PREFIX = 'nexus-custom-dashboard';

function storageKey(principalId: string) {
  return `${STORAGE_PREFIX}-${principalId}`;
}

export function getPinnedSections(principalId: string): PinnedSection[] {
  try {
    const raw = localStorage.getItem(storageKey(principalId));
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function savePinnedSections(principalId: string, sections: PinnedSection[]) {
  try { localStorage.setItem(storageKey(principalId), JSON.stringify(sections)); } catch {}
}

export function togglePin(principalId: string, section: Omit<PinnedSection, 'order'>): PinnedSection[] {
  const current = getPinnedSections(principalId);
  const exists = current.find(s => s.id === section.id);
  let updated: PinnedSection[];
  if (exists) {
    updated = current.filter(s => s.id !== section.id).map((s, i) => ({ ...s, order: i }));
  } else {
    updated = [...current, { ...section, order: current.length }];
  }
  savePinnedSections(principalId, updated);
  return updated;
}

export function isPinned(principalId: string, sectionId: string): boolean {
  return getPinnedSections(principalId).some(s => s.id === sectionId);
}

/* ── Icon resolver ─────────────────────────────────────────────────────── */

const ICON_MAP: Record<string, typeof Shield> = {
  shield: Shield, target: Target, brain: Brain, key: Key,
  lock: Lock, eye: Eye, users: Users, plug: Plug,
  settings: Settings, sparkles: Sparkles, network: Network,
};

function SectionIcon({ name, className }: { name?: string; className?: string }) {
  const Icon = ICON_MAP[name ?? ''] ?? LayoutGrid;
  return <Icon className={className} />;
}

/* ── View label helper ─────────────────────────────────────────────────── */

const VIEW_LABELS: Record<string, string> = {
  dashboard: 'Overview',
  threat: 'Threats',
  admin: 'Admin',
};

/* ── Reusable PinButton for section headers ────────────────────────────── */

interface PinButtonProps {
  sectionId: string;
  principalId: string;
}

export function PinButton({ sectionId, principalId }: PinButtonProps) {
  const section = AVAILABLE_SECTIONS.find(s => s.id === sectionId);
  const [pinned, setPinned] = useState(() => isPinned(principalId, sectionId));

  if (!section) return null;

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        togglePin(principalId, section);
        setPinned(!pinned);
      }}
      className={`p-1.5 rounded-md transition-colors ${
        pinned
          ? 'text-primary/70 hover:text-primary bg-primary/10'
          : 'text-white/20 hover:text-white/50 hover:bg-white/[0.04]'
      }`}
      title={pinned ? 'Unpin from My View' : 'Pin to My View'}
    >
      {pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
    </button>
  );
}

/* ── Custom Dashboard component ────────────────────────────────────────── */

interface CustomDashboardProps {
  principalId: string;
  onNavigate: (view: string, sectionId?: string) => void;
}

export default function CustomDashboard({ principalId, onNavigate }: CustomDashboardProps) {
  const [pinned, setPinned] = useState(() => getPinnedSections(principalId));
  const [showBrowser, setShowBrowser] = useState(false);

  const handleUnpin = useCallback((sectionId: string) => {
    const section = pinned.find(s => s.id === sectionId);
    if (!section) return;
    const updated = togglePin(principalId, section);
    setPinned(updated);
  }, [principalId, pinned]);

  const handlePin = useCallback((section: Omit<PinnedSection, 'order'>) => {
    const updated = togglePin(principalId, section);
    setPinned(updated);
  }, [principalId]);

  const isPinnedCheck = (id: string) => pinned.some(s => s.id === id);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary/10">
            <LayoutGrid className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white/90">My View</h2>
            <p className="text-xs text-white/40">Your pinned sections from across the app</p>
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setShowBrowser(!showBrowser)}
          className="rounded-full btn-press text-xs"
        >
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          {showBrowser ? 'Hide sections' : 'Browse sections'}
        </Button>
      </div>

      {/* Section browser */}
      {showBrowser && (
        <Card className="border-border/40 glass-strong shadow-depth-md">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Available Sections</CardTitle>
            <CardDescription className="text-xs">Click to pin or unpin sections to your dashboard</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="max-h-[320px]">
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {AVAILABLE_SECTIONS.map(section => {
                  const active = isPinnedCheck(section.id);
                  return (
                    <button
                      key={section.id}
                      onClick={() => handlePin(section)}
                      className={`flex items-center gap-3 p-3 rounded-xl border transition-all text-left btn-press ${
                        active
                          ? 'border-primary/40 bg-primary/10'
                          : 'border-border/30 hover:border-border/50 hover:bg-white/[0.03]'
                      }`}
                    >
                      <SectionIcon name={section.icon} className={`h-4 w-4 shrink-0 ${active ? 'text-primary' : 'text-white/40'}`} />
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs font-medium truncate ${active ? 'text-primary' : 'text-white/70'}`}>{section.label}</p>
                        <p className="text-[10px] text-white/30 truncate">{VIEW_LABELS[section.sourceView] ?? section.sourceView}</p>
                      </div>
                      {active ? (
                        <PinOff className="h-3.5 w-3.5 text-primary/60 shrink-0" />
                      ) : (
                        <Pin className="h-3.5 w-3.5 text-white/20 shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {/* Pinned cards grid */}
      {pinned.length > 0 ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {pinned.sort((a, b) => a.order - b.order).map(section => (
            <Card key={section.id} className="border-border/40 glass-strong shadow-depth-md card-tactile group hover:border-primary/30 transition-all">
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <SectionIcon name={section.icon} className="h-4 w-4 text-primary" />
                  </div>
                  <button
                    onClick={() => handleUnpin(section.id)}
                    className="p-1.5 rounded-md text-white/20 hover:text-red-400 hover:bg-red-500/10 transition-colors opacity-0 group-hover:opacity-100"
                    title="Unpin"
                  >
                    <PinOff className="h-3.5 w-3.5" />
                  </button>
                </div>
                <h3 className="text-sm font-semibold text-white/85 mb-1">{section.label}</h3>
                {section.description && (
                  <p className="text-[11px] text-white/35 mb-3 line-clamp-2">{section.description}</p>
                )}
                <div className="flex items-center justify-between">
                  <Badge
                    variant="secondary"
                    className="text-[10px] font-mono"
                  >
                    {VIEW_LABELS[section.sourceView] ?? section.sourceView}
                  </Badge>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2.5 rounded-full text-xs text-white/50 hover:text-white/80 btn-press"
                    onClick={() => onNavigate(section.sourceView, section.sectionId)}
                  >
                    <ExternalLink className="h-3 w-3 mr-1" />
                    View Full
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="border-border/40 glass-strong shadow-depth-md border-dashed">
          <CardContent className="py-16 text-center">
            <div className="p-4 rounded-2xl bg-white/[0.03] inline-block mb-4">
              <Pin className="h-8 w-8 text-white/15" />
            </div>
            <h3 className="text-sm font-medium text-white/50 mb-1.5">No pinned sections yet</h3>
            <p className="text-xs text-white/30 max-w-sm mx-auto mb-4">
              Pin sections from any page to create your custom view. Click "Browse sections" above to get started.
            </p>
            <Button
              size="sm"
              variant="outline"
              className="rounded-full text-xs btn-press"
              onClick={() => setShowBrowser(true)}
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Browse sections
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
