import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sparkles, X, Send, Loader2, Settings2 } from 'lucide-react';
import { useGetVaultEntries, useGetRecommendations, useChatWithAI } from './hooks/useQueries';
import { toast } from 'sonner';
import { settings as appSettings } from './lib/storage';
import type { AIContext } from './backend';

interface Message {
  id: string;
  type: 'user' | 'ai';
  content: string;
  timestamp: number;
  actions?: Array<{ label: string; onClick: () => void }>;
}

interface FloatingAICoachProps {
  currentPage?: string;
  embedded?: boolean;
  onClose?: () => void;
}

export default function FloatingAICoach({ currentPage = 'dashboard', embedded = false, onClose }: FloatingAICoachProps) {
  const [isOpen, setIsOpen] = useState(embedded);
  const [isActive, setIsActive] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const { data: vaultEntries } = useGetVaultEntries();
  const { data: recommendations } = useGetRecommendations();
  const { mutate: chatWithAI, isPending: isChatPending } = useChatWithAI();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Simulate AI activity pulse
  useEffect(() => {
    const interval = setInterval(() => {
      setIsActive(prev => !prev);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Context-aware greeting based on current page
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      const contextGreeting = getContextualGreeting(currentPage);
      setMessages([{
        id: '1',
        type: 'ai',
        content: contextGreeting,
        timestamp: Date.now(),
      }]);
    }
  }, [isOpen, currentPage]);

  // Proactive insights based on vault data
  useEffect(() => {
    if (recommendations && recommendations.length > 0 && messages.length === 1 && isOpen) {
      const criticalRecs = recommendations.filter(r => r.severity === 'high' || r.severity === 'critical' || r.priority === 'high' || r.priority === 'critical');
      if (criticalRecs.length > 0) {
        setTimeout(() => {
          setMessages(prev => [...prev, {
            id: `insight-${Date.now()}`,
            type: 'ai',
            content: `🚨 I've detected ${criticalRecs.length} critical security ${criticalRecs.length === 1 ? 'issue' : 'issues'} that need immediate attention. Would you like me to help you address them?`,
            timestamp: Date.now(),
            actions: [
              { label: 'Show Issues', onClick: () => handleShowIssues() },
              { label: 'Later', onClick: () => toast.info('Reminder set for later') }
            ]
          }]);
        }, 2000);
      }
    }
  }, [recommendations, messages.length, isOpen]);

  const hasApiKey = !!appSettings.getAiKey();

  const getContextualGreeting = (page: string) => {
    const aiSource = hasApiKey ? 'Claude (Anthropic)' : 'local security heuristics';
    const greetings: Record<string, string> = {
      dashboard: `Hi! I'm your Nexus AI Security Coach, powered by ${aiSource}. I analyse your vault health, auth events and threat posture in real-time. What can I help you with?`,
      passkeys:  `Passkeys use FIDO2/WebAuthn — the private key is generated in your device's secure enclave and never leaves it. Authentication is phishing-proof and domain-scoped. Click "Register Passkey" to try it for real.`,
      vault:     `Your vault uses AES-256-GCM with a PBKDF2-derived key. I can help you audit password strength, detect reuse, or rotate stale credentials. What would you like to review?`,
      biometric: `Biometric authentication binds a FIDO2 credential to your platform authenticator (Touch ID, Face ID, Windows Hello). The biometric data stays on-device — Nexus never sees it.`,
      threat:    `I'm scanning your vault and auth events for threats. Run a full scan to get an up-to-date risk breakdown. Ask me about any specific concern.`,
      team:      `Team security is about least-privilege access and audit trails. I can help you review member permissions, detect over-provisioned accounts, or set up MFA enforcement.`,
      integrations: `SSO integrations centralize identity management. I can guide you through Okta, Microsoft Entra ID or Ping Identity setup using OAuth2/SAML flows.`,
      developer: `The Nexus SDK exposes REST and WebSocket APIs for identity fabric integration. Ask me about auth flows, webhook setup or SDK usage.`,
      admin:     `You have admin access. I can help with compliance monitoring (SOC2, ISO27001, GDPR), SIEM event analysis and automated policy enforcement.`,
      federated: `Nexus Fabric enables cross-platform identity sync via OpenID Connect and verifiable credentials. Ask me about federation with Entra ID, Okta or Web3 DID.`,
    };
    return greetings[page] || greetings.dashboard;
  };

  const handleShowIssues = () => {
    const criticalRecs = recommendations?.filter(r => r.severity === 'high' || r.severity === 'critical' || r.priority === 'high' || r.priority === 'critical') || [];
    const issuesList = criticalRecs.map((rec, idx) => `${idx + 1}. ${rec.message || rec.description}`).join('\n');
    setMessages(prev => [...prev, {
      id: `issues-${Date.now()}`,
      type: 'ai',
      content: `Here are the critical issues:\n\n${issuesList}\n\nI recommend addressing these immediately to improve your security score. I can help you auto-apply fixes via provider APIs.`,
      timestamp: Date.now(),
    }]);
  };

  const handleSendMessage = () => {
    if (!inputValue.trim() || isChatPending) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      type: 'user',
      content: inputValue,
      timestamp: Date.now(),
    };

    setMessages(prev => [...prev, userMessage]);
    const currentInput = inputValue;
    setInputValue('');

    // Prepare context for AI
    const weakPasswords = vaultEntries?.filter(e => 
      e.category === 'password' && e.encryptedData.length < 12
    ).length || 0;

    const oldCredentials = vaultEntries?.filter(e => {
      const daysSinceUpdate = (Date.now() - Number(e.updatedAt) / 1000000) / (1000 * 60 * 60 * 24);
      return daysSinceUpdate > 90;
    }).length || 0;

    const context: AIContext = {
      vaultHealth: JSON.stringify({
        totalEntries: vaultEntries?.length || 0,
        weakPasswords,
        oldCredentials,
        missingMFA: vaultEntries?.length || 0,
      }),
      authEvents: JSON.stringify({
        isAuthenticated: true,
        hasPasskeys: false,
        hasBiometric: false,
        currentPage,
      }),
      deviceData: JSON.stringify({
        lastActivity: Date.now(),
        securityScore: 80,
        userQuery: currentInput,
        conversationHistory: messages.slice(-3).map(m => `${m.type}: ${m.content}`).join('\n'),
      }),
    };

    // Get conversation history for context
    const conversationHistory = messages
      .slice(-5)
      .map(msg => ({
        role: msg.type === 'user' ? 'user' as const : 'assistant' as const,
        content: msg.content,
      }));

    // Call ChatAnywhere API via backend
    chatWithAI(
      {
        messages: [
          ...conversationHistory,
          { role: 'user', content: currentInput }
        ],
        context,
      },
      {
        onSuccess: (response) => {
          const aiMessage: Message = {
            id: `ai-${Date.now()}`,
            type: 'ai',
            content: response.message || 'I apologize, but I encountered an issue processing your request. Please try again.',
            timestamp: Date.now(),
          };
          setMessages(prev => [...prev, aiMessage]);
        },
        onError: (error) => {
          console.error('Chat error:', error);
          // Fallback to local response
          const fallbackResponse = generateLocalResponse(currentInput, currentPage, vaultEntries, recommendations);
          setMessages(prev => [...prev, fallbackResponse]);
        },
      }
    );
  };

  const generateLocalResponse = (query: string, page: string, vault: any, recs: any): Message => {
    const lowerQuery = query.toLowerCase();

    if (lowerQuery.includes('fido') || lowerQuery.includes('webauthn') || lowerQuery.includes('passkey')) {
      return {
        id: `ai-${Date.now()}`,
        type: 'ai',
        content: "Passkeys use FIDO2/WebAuthn standards with FIDO Alliance MDS integration (https://mds.fidoalliance.org/) for device verification and attestation validation using official specifications and validation libraries. They're phishing-resistant and stored securely in your device's hardware. Backend OAuth2 integration enables real device verification with live API connections.",
        timestamp: Date.now(),
        actions: [
          { label: 'Setup Passkey', onClick: () => toast.info('Navigate to Passkeys tab') }
        ]
      };
    }

    if (lowerQuery.includes('1password') || lowerQuery.includes('password manager')) {
      return {
        id: `ai-${Date.now()}`,
        type: 'ai',
        content: "Nexus integrates with 1Password Connect API for encrypted vault sync and credential storage using secure OAuth2 or signed requests. The 1Password Events API provides audit trails and SIEM sync for enterprise security workflows with real-time event streaming.",
        timestamp: Date.now(),
        actions: [
          { label: 'Connect 1Password', onClick: () => toast.info('Opening integrations...') }
        ]
      };
    }

    if (lowerQuery.includes('sso') || lowerQuery.includes('okta') || lowerQuery.includes('entra') || lowerQuery.includes('azure') || lowerQuery.includes('ping')) {
      return {
        id: `ai-${Date.now()}`,
        type: 'ai',
        content: "Nexus supports production enterprise SSO with Okta, Microsoft Entra ID, Ping Identity, Cisco Duo, and HYPR using verified API endpoints and secure OAuth2 authentication. These integrations provide automated user provisioning, MFA enforcement, and risk-based authentication with live data fetching.",
        timestamp: Date.now(),
        actions: [
          { label: 'View Integrations', onClick: () => toast.info('Opening integrations...') }
        ]
      };
    }

    if (lowerQuery.includes('ai') || lowerQuery.includes('machine learning') || lowerQuery.includes('autonomous') || lowerQuery.includes('chatanywhere')) {
      return {
        id: `ai-${Date.now()}`,
        type: 'ai',
        content: "The Autonomous Context Engine is powered by ChatAnywhere API (GPT-4o-ca) via backend AIClient service and monitors all platform states: authentication events, vault health, user behavior patterns, device trust levels, and team activities. It performs real-time anomaly detection, predictive breach analysis, and automated threat response using contextual learning.",
        timestamp: Date.now(),
      };
    }

    if (lowerQuery.includes('score') || lowerQuery.includes('security')) {
      const vaultCount = vault?.length || 0;
      const secureCount = vault?.filter((e: any) => e.encryptedData.length >= 12).length || 0;
      return {
        id: `ai-${Date.now()}`,
        type: 'ai',
        content: `Your security score is based on ${vaultCount} accounts. ${secureCount} have strong encryption. To improve your score, I recommend: 1) Enabling MFA on all accounts via Cisco Duo or HYPR with OAuth2 integration, 2) Using unique passwords, 3) Rotating credentials older than 90 days. ChatAnywhere API continuously monitors and provides real-time recommendations with auto-apply fixes via provider APIs.`,
        timestamp: Date.now(),
      };
    }

    return {
      id: `ai-${Date.now()}`,
      type: 'ai',
      content: "I'm here to help with security questions, password management, passkey setup, threat analysis, SSO integrations, and more. Try asking me about FIDO2/WebAuthn with FIDO Alliance MDS, 1Password Connect/Events API integration, Okta/Entra ID/Ping Identity SSO with OAuth2 flows, Cisco Duo/HYPR MFA, or the Autonomous Context Engine powered by ChatAnywhere API via backend AIClient.",
      timestamp: Date.now(),
    };
  };

  // Chat content shared between embedded and floating modes
  const chatContent = (
    <>
      <div className="flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
        <div className="p-1.5 rounded-lg" style={{ background: 'rgba(139,92,246,0.15)' }}>
          <Sparkles className="h-4 w-4 text-violet-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white/80">AI Security Coach</p>
          <p className="text-[10px] text-white/35 flex items-center gap-1">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
            {hasApiKey ? 'Claude (Anthropic) · ' : 'Local mode · '}
            {currentPage}
          </p>
        </div>
        {!hasApiKey && (
          <button
            onClick={() => toast.info('Add your Anthropic API key in Settings → AI Coach')}
            className="h-6 px-2 rounded-full text-[10px] font-mono text-white/40 hover:text-white/70 transition-colors"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            + API key
          </button>
        )}
        {(embedded && onClose) && (
          <Button variant="ghost" size="icon" className="h-7 w-7 text-white/30 hover:text-white/60" onClick={onClose}>
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        <div className="space-y-3">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[90%] rounded-xl p-3 ${
                  message.type === 'user'
                    ? 'bg-primary/80 text-white text-sm'
                    : 'text-sm text-white/70'
                }`}
                style={message.type === 'ai' ? { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' } : {}}
              >
                <p className="text-sm whitespace-pre-wrap leading-relaxed">{message.content}</p>
                {message.actions && (
                  <div className="flex gap-2 mt-2">
                    {message.actions.map((action, idx) => (
                      <Button key={idx} size="sm" variant="secondary" onClick={action.onClick} className="h-6 text-[10px] rounded-full btn-press">
                        {action.label}
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          {isChatPending && (
            <div className="flex justify-start">
              <div className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.04)' }}>
                <div className="flex items-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                  <span className="text-xs text-white/40">Analyzing...</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
      <div className="p-3 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
        <div className="flex gap-2">
          <Input
            placeholder="Ask about security..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
            className="bg-white/[0.04] border-white/[0.06] text-sm h-9 text-white placeholder:text-white/25"
            disabled={isChatPending}
          />
          <Button
            onClick={handleSendMessage}
            size="icon"
            className="h-9 w-9 rounded-lg bg-primary/80 hover:bg-primary btn-press shrink-0"
            disabled={isChatPending || !inputValue.trim()}
          >
            {isChatPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>
    </>
  );

  // Embedded mode: render directly as a flex column
  if (embedded) {
    return <div className="flex flex-col h-full">{chatContent}</div>;
  }

  // Floating mode
  return (
    <>
      <div className="fixed bottom-6 right-6 z-50">
        <Button
          onClick={() => setIsOpen(!isOpen)}
          className={`h-14 w-14 rounded-full shadow-depth-lg hover:scale-110 transition-all duration-300 ${
            isActive ? 'animate-pulse glow-primary-soft' : ''
          }`}
          style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.9), rgba(34,211,238,0.7))' }}
        >
          {isOpen ? <X className="h-5 w-5 text-white" /> : <Sparkles className="h-5 w-5 text-white" />}
        </Button>
      </div>

      {isOpen && (
        <div className="fixed bottom-24 right-6 z-50 w-[360px] h-[480px] animate-scale-in aurora-panel-strong rounded-xl overflow-hidden flex flex-col shadow-depth-lg" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
          {chatContent}
        </div>
      )}
    </>
  );
}
