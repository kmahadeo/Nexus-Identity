/**
 * ProtectedReports.tsx — MFA-gated security report exports.
 *
 * Generates styled HTML reports (opens in print dialog for PDF).
 * Requires TOTP verification before download.
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  FileText, Shield, Download, Lock, CheckCircle2, AlertCircle,
  Fingerprint, Clock, BarChart3, Users, Key,
} from 'lucide-react';
import { toast } from 'sonner';
import { totpStorage, verifyTOTP } from './lib/totp';
import { sessionStorage_ } from './lib/storage';

interface ReportData {
  totalUsers: number;
  activeUsers: number;
  mfaAdoption: number;
  activePolicies: number;
  complianceScore: number;
  weakPasswords: number;
  hardwareKeys: number;
  users: { name: string; email: string; role: string; mfaEnabled: boolean; vaultCount: number }[];
  policies: { name: string; type: string; severity: string; enabled: boolean; enforcement: string }[];
}

interface Props {
  reportData: ReportData;
}

const REPORT_TYPES = [
  {
    id: 'security-audit',
    title: 'Security Audit Report',
    description: 'Full platform security posture assessment',
    icon: Shield,
    color: '#a78bfa',
    includes: ['User MFA adoption', 'Password health', 'Policy compliance', 'Threat summary'],
  },
  {
    id: 'compliance',
    title: 'Compliance Report',
    description: 'SOC2 / ISO 27001 / GDPR readiness',
    icon: CheckCircle2,
    color: '#22d3ee',
    includes: ['Control mapping', 'Evidence summary', 'Gap analysis', 'Remediation plan'],
  },
  {
    id: 'user-access',
    title: 'User Access Report',
    description: 'Who has access to what, and when',
    icon: Users,
    color: '#f59e0b',
    includes: ['User inventory', 'Role assignments', 'Permission matrix', 'Last login'],
  },
];

export default function ProtectedReports({ reportData }: Props) {
  const session = sessionStorage_.get();
  const principalId = session?.principalId ?? '';
  const hasTotp = totpStorage.getAll(principalId).some(c => c.verified);

  const [mfaCode, setMfaCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verifiedUntil, setVerifiedUntil] = useState(0);
  const [activeReport, setActiveReport] = useState<string | null>(null);

  const isVerified = Date.now() < verifiedUntil;

  const handleVerify = async () => {
    if (!hasTotp) {
      // No TOTP enrolled — allow with warning
      setVerifiedUntil(Date.now() + 5 * 60 * 1000);
      toast.warning('Reports accessible — set up MFA for stronger protection');
      return;
    }

    if (!mfaCode.trim() || mfaCode.length !== 6) {
      toast.error('Enter a 6-digit authenticator code');
      return;
    }

    setVerifying(true);
    try {
      const creds = totpStorage.getAll(principalId).filter(c => c.verified);
      for (const cred of creds) {
        if (await verifyTOTP(cred.secret, mfaCode.trim())) {
          setVerifiedUntil(Date.now() + 5 * 60 * 1000); // 5-minute window
          setMfaCode('');
          toast.success('Verified — reports unlocked for 5 minutes');
          return;
        }
      }
      toast.error('Invalid authenticator code');
    } catch {
      toast.error('Verification failed');
    } finally {
      setVerifying(false);
    }
  };

  const generateReport = (reportId: string) => {
    if (!isVerified) {
      setActiveReport(reportId);
      return;
    }

    const type = REPORT_TYPES.find(r => r.id === reportId);
    if (!type) return;

    const now = new Date();
    const html = buildReportHTML(type, reportData, now);

    // Open in new window for print-to-PDF
    const win = window.open('', '_blank');
    if (win) {
      win.document.write(html);
      win.document.close();
      // Auto-trigger print dialog for PDF save
      setTimeout(() => win.print(), 500);
      toast.success(`${type.title} generated — use "Save as PDF" in the print dialog`);
    } else {
      toast.error('Popup blocked — please allow popups for PDF export');
    }
  };

  return (
    <div className="space-y-4">
      {/* MFA Gate */}
      {!isVerified && (
        <Card className="border-border/40 glass-strong shadow-depth-md">
          <CardContent className="p-5">
            <div className="flex items-start gap-4">
              <div className="p-3 rounded-xl bg-violet-400/10">
                <Lock className="h-6 w-6 text-violet-400" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-white/90 mb-1">Reports are MFA-protected</h3>
                <p className="text-xs text-white/40 mb-3">
                  {hasTotp
                    ? 'Enter your authenticator code to unlock report exports'
                    : 'Reports require MFA — set up TOTP in Settings for full protection'}
                </p>
                <div className="flex items-center gap-2">
                  {hasTotp && (
                    <Input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      value={mfaCode}
                      onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ''))}
                      placeholder="6-digit code"
                      className="glass-effect text-sm w-36 text-center font-mono tracking-[0.2em]"
                    />
                  )}
                  <Button
                    onClick={handleVerify}
                    disabled={verifying}
                    size="sm"
                    className="rounded-full btn-press"
                    style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.9), rgba(167,139,250,0.8))', border: 'none' }}
                  >
                    {verifying
                      ? <div className="h-3.5 w-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      : <><Fingerprint className="h-3.5 w-3.5 mr-1" /> {hasTotp ? 'Verify' : 'Continue'}</>}
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {isVerified && (
        <div className="flex items-center gap-2 p-2.5 rounded-lg glass-effect text-xs text-emerald-400">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Reports unlocked · expires in {Math.ceil((verifiedUntil - Date.now()) / 60000)} min
        </div>
      )}

      {/* Report cards */}
      <div className="space-y-3">
        {REPORT_TYPES.map((report) => (
          <div
            key={report.id}
            className="p-4 rounded-xl border border-border/40 glass-effect card-tactile"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 flex-1">
                <div className="p-2.5 rounded-xl" style={{ background: `${report.color}12` }}>
                  <report.icon className="h-5 w-5" style={{ color: report.color }} />
                </div>
                <div className="flex-1">
                  <h4 className="text-sm font-semibold text-white/85 mb-0.5">{report.title}</h4>
                  <p className="text-xs text-white/35 mb-2">{report.description}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {report.includes.map((item, i) => (
                      <Badge key={i} variant="secondary" className="text-[10px] px-1.5">
                        {item}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
              <Button
                onClick={() => generateReport(report.id)}
                size="sm"
                variant="outline"
                className="rounded-full btn-press text-xs shrink-0"
                disabled={!isVerified}
              >
                <Download className="h-3.5 w-3.5 mr-1" /> Export PDF
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Report HTML builder ──────────────────────────────────────────────── */

function buildReportHTML(
  type: typeof REPORT_TYPES[number],
  data: ReportData,
  date: Date,
): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${type.title} — Nexus Identity</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1a1a2e; padding: 40px; max-width: 800px; margin: 0 auto; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #7c3aed; padding-bottom: 20px; margin-bottom: 30px; }
    .logo { font-size: 24px; font-weight: 700; color: #7c3aed; }
    .logo span { color: #94a3b8; font-weight: 400; font-size: 14px; display: block; }
    .meta { text-align: right; font-size: 12px; color: #64748b; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
    .badge-purple { background: #ede9fe; color: #7c3aed; }
    .badge-green { background: #dcfce7; color: #16a34a; }
    .badge-red { background: #fee2e2; color: #dc2626; }
    .badge-amber { background: #fef3c7; color: #d97706; }
    h2 { font-size: 18px; margin: 24px 0 12px; color: #1e1b4b; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px; }
    .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 24px; }
    .stat { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; text-align: center; }
    .stat-value { font-size: 28px; font-weight: 700; color: #1e1b4b; }
    .stat-label { font-size: 11px; color: #64748b; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; margin: 12px 0; }
    th { background: #f1f5f9; text-align: left; padding: 8px 12px; font-size: 11px; font-weight: 600; color: #475569; border-bottom: 2px solid #e2e8f0; }
    td { padding: 8px 12px; font-size: 12px; border-bottom: 1px solid #f1f5f9; }
    tr:hover td { background: #f8fafc; }
    .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 10px; color: #94a3b8; text-align: center; }
    .confidential { color: #dc2626; font-weight: 600; font-size: 11px; margin-top: 8px; }
    @media print { body { padding: 20px; } }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo">
      Nexus Identity
      <span>${type.title}</span>
    </div>
    <div class="meta">
      <div>Generated: ${date.toLocaleDateString()} ${date.toLocaleTimeString()}</div>
      <div>Report ID: NXR-${Date.now().toString(36).toUpperCase()}</div>
      <div class="badge badge-purple" style="margin-top: 4px;">CONFIDENTIAL</div>
    </div>
  </div>

  <h2>Executive Summary</h2>
  <div class="grid">
    <div class="stat"><div class="stat-value">${data.totalUsers}</div><div class="stat-label">Total Users</div></div>
    <div class="stat"><div class="stat-value">${data.mfaAdoption}%</div><div class="stat-label">MFA Adoption</div></div>
    <div class="stat"><div class="stat-value">${data.activePolicies}</div><div class="stat-label">Active Policies</div></div>
    <div class="stat"><div class="stat-value">${data.complianceScore}%</div><div class="stat-label">Compliance Score</div></div>
  </div>

  <h2>Risk Indicators</h2>
  <div class="grid">
    <div class="stat"><div class="stat-value">${data.weakPasswords}</div><div class="stat-label">Weak Passwords</div></div>
    <div class="stat"><div class="stat-value">${data.hardwareKeys}</div><div class="stat-label">Hardware Keys</div></div>
    <div class="stat"><div class="stat-value">${data.activeUsers}</div><div class="stat-label">Active Users</div></div>
    <div class="stat"><div class="stat-value">${data.totalUsers - data.activeUsers}</div><div class="stat-label">Inactive Users</div></div>
  </div>

  <h2>User Inventory</h2>
  <table>
    <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>MFA</th><th>Vault</th></tr></thead>
    <tbody>
      ${data.users.map(u => `
        <tr>
          <td>${u.name}</td>
          <td>${u.email}</td>
          <td><span class="badge badge-purple">${u.role}</span></td>
          <td><span class="badge ${u.mfaEnabled ? 'badge-green' : 'badge-red'}">${u.mfaEnabled ? 'Enabled' : 'Disabled'}</span></td>
          <td>${u.vaultCount}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <h2>Security Policies</h2>
  <table>
    <thead><tr><th>Policy</th><th>Type</th><th>Severity</th><th>Status</th><th>Enforcement</th></tr></thead>
    <tbody>
      ${data.policies.map(p => `
        <tr>
          <td>${p.name}</td>
          <td>${p.type}</td>
          <td><span class="badge ${p.severity === 'critical' ? 'badge-red' : p.severity === 'high' ? 'badge-amber' : 'badge-purple'}">${p.severity}</span></td>
          <td><span class="badge ${p.enabled ? 'badge-green' : 'badge-red'}">${p.enabled ? 'Active' : 'Disabled'}</span></td>
          <td>${p.enforcement}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <div class="footer">
    <p>This report was generated by Nexus Identity Platform. All data is encrypted in transit and at rest.</p>
    <p class="confidential">CONFIDENTIAL — Do not distribute without authorization.</p>
  </div>
</body>
</html>`;
}
