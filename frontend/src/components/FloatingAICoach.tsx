import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Shield, X, Send, Brain } from 'lucide-react';
import { useGetVaultEntries, useGetRecommendations, useGetPasskeyCount, useGetTeams } from '../hooks/useQueries';
import { computeSecurityScore, generateInsights, generateContextualResponse, type SecurityState } from '../lib/securityEngine';

interface Message {
  id: string;
  type: 'user' | 'ai';
  content: string;
  timestamp: number;
}

interface FloatingAICoachProps {
  currentPage?: string;
}

export default function FloatingAICoach({ currentPage = 'dashboard' }: FloatingAICoachProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const { data: vaultEntries = [] } = useGetVaultEntries();
  const { data: recommendations = [] } = useGetRecommendations();
  const { data: passkeyCount = 0 } = useGetPasskeyCount();
  const { data: teams = [] } = useGetTeams();
  const scrollRef = useRef<HTMLDivElement>(null);

  const state: SecurityState = {
    vaultEntries,
    passkeyCount,
    recommendations,
    teamCount: teams.length,
  };

  const score = computeSecurityScore(state);
  const insights = generateInsights(state);
  const hasCritical = insights.some((i) => i.priority === 'critical');

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Greeting when opened — honest about being rule-based
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      const criticalInsights = insights.filter((i) => i.priority === 'critical');
      const highInsights = insights.filter((i) => i.priority === 'high');
      let greeting = `Security Advisor (rule-based, local analysis)\n\nScore: ${score}/100 | ${vaultEntries.length} vault entries | ${passkeyCount} passkeys`;
      if (criticalInsights.length > 0) {
        greeting += `\n\n${criticalInsights.length} critical issue${criticalInsights.length !== 1 ? 's' : ''} found:\n`;
        criticalInsights.forEach((i) => { greeting += `- ${i.message}\n`; });
      }
      if (highInsights.length > 0) {
        greeting += `\n${highInsights.length} high-priority issue${highInsights.length !== 1 ? 's' : ''}:\n`;
        highInsights.forEach((i) => { greeting += `- ${i.message}\n`; });
      }
      if (criticalInsights.length === 0 && highInsights.length === 0) {
        greeting += `\n\nNo critical or high-priority issues. Your posture looks solid.`;
      }
      greeting += `\n\nAsk about your score breakdown, specific credentials, weak passwords, or what to fix next.`;
      setMessages([
        {
          id: '1',
          type: 'ai',
          content: greeting,
          timestamp: Date.now(),
        },
      ]);
    }
  }, [isOpen]);

  const handleSendMessage = () => {
    if (!inputValue.trim()) return;

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      type: 'user',
      content: inputValue,
      timestamp: Date.now(),
    };

    const response = generateContextualResponse(inputValue, state, currentPage);

    const aiMsg: Message = {
      id: `ai-${Date.now()}`,
      type: 'ai',
      content: response,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMsg, aiMsg]);
    setInputValue('');
  };

  return (
    <>
      {/* Floating Orb */}
      <div className="fixed bottom-6 right-6 z-50">
        <Button
          onClick={() => setIsOpen(!isOpen)}
          className={`h-16 w-16 rounded-full bg-gradient-to-br from-primary to-accent shadow-depth-lg hover:shadow-depth-lg hover:scale-110 transition-all duration-300`}
        >
          {isOpen ? (
            <X className="h-6 w-6 text-white" />
          ) : (
            <Shield className="h-6 w-6 text-white" />
          )}
          {!isOpen && hasCritical && (
            <div className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-destructive animate-pulse" />
          )}
        </Button>
      </div>

      {/* Chat Panel */}
      {isOpen && (
        <div className="fixed bottom-24 right-6 z-50 w-96 animate-scale-in">
          <Card className="border-border/40 glass-strong shadow-depth-lg overflow-hidden">
            <CardHeader className="border-b border-border/40 bg-gradient-to-br from-primary/10 to-accent/5">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-gradient-to-br from-primary/20 to-accent/10 shadow-depth-sm">
                  <Shield className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1">
                  <CardTitle className="text-lg">Security Advisor</CardTitle>
                  <CardDescription className="text-xs flex items-center gap-1">
                    <Brain className="h-3 w-3" />
                    Rule-based &bull; Score: {score}/100
                  </CardDescription>
                </div>
                <Badge variant="secondary" className="text-xs">
                  Local
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-96 p-4" ref={scrollRef}>
                <div className="space-y-4">
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[85%] rounded-2xl p-3 ${
                          message.type === 'user'
                            ? 'bg-primary text-primary-foreground shadow-depth-sm'
                            : 'glass-effect border border-border/40 shadow-depth-sm'
                        }`}
                      >
                        <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                        <p className="text-xs opacity-60 mt-2">
                          {new Date(message.timestamp).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
              <div className="p-4 border-t border-border/40 glass-effect">
                <div className="flex gap-2">
                  <Input
                    placeholder="Ask about your security..."
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
                    className="glass-effect"
                  />
                  <Button
                    onClick={handleSendMessage}
                    size="icon"
                    className="rounded-full bg-primary hover:bg-primary/90 btn-press"
                    disabled={!inputValue.trim()}
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-2 text-center">
                  Rule-based local analysis &bull; No data leaves your browser
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
