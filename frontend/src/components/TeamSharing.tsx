import { useState, useEffect } from 'react';
import { useGetTeams, useCreateTeam, useAddTeamMember, useGetSharedVaultEntries, useShareVaultEntry, useGetVaultEntries } from '../hooks/useQueries';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Users, UserPlus, Shield, Clock, Eye, Edit, Crown, Share2, Lock, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { Principal } from '@icp-sdk/core/principal';
import type { TeamMember } from '../backend';
import { getAuditLog, type AuditEvent } from '../../../lib/auditLog';

export default function TeamSharing() {
  const { data: teams } = useGetTeams();
  const { data: sharedEntries } = useGetSharedVaultEntries();
  const { data: vaultEntries } = useGetVaultEntries();
  const { mutate: createTeam, isPending: isCreating } = useCreateTeam();
  const { mutate: addMember, isPending: isAddingMember } = useAddTeamMember();
  const { mutate: shareEntry, isPending: isSharing } = useShareVaultEntry();

  const [isTeamDialogOpen, setIsTeamDialogOpen] = useState(false);
  const [isMemberDialogOpen, setIsMemberDialogOpen] = useState(false);
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<string>('');
  const [teamName, setTeamName] = useState('');
  const [teamType, setTeamType] = useState<'Family' | 'Team' | 'Enterprise'>('Family');
  const [memberPrincipal, setMemberPrincipal] = useState('');
  const [memberRole, setMemberRole] = useState<'view' | 'edit' | 'owner'>('view');
  const [selectedEntry, setSelectedEntry] = useState('');
  const [sharePermission, setSharePermission] = useState<'view' | 'edit'>('view');

  const totalMembers = teams?.reduce((acc, team) => acc + team.members.length, 0) || 0;
  const totalShared = sharedEntries?.length || 0;

  const handleCreateTeam = () => {
    if (!teamName.trim()) {
      toast.error('Please enter a team name');
      return;
    }

    const fullName = `${teamName.trim()} (${teamType})`;
    createTeam(fullName, {
      onSuccess: () => {
        toast.success('Team created successfully');
        setTeamName('');
        setIsTeamDialogOpen(false);
      },
      onError: () => {
        toast.error('Failed to create team');
      },
    });
  };

  const handleAddMember = () => {
    if (!selectedTeam || !memberPrincipal.trim()) {
      toast.error('Please fill in all fields');
      return;
    }

    try {
      const principal = Principal.fromText(memberPrincipal.trim());
      const member: TeamMember = {
        principal,
        role: memberRole,
        addedAt: BigInt(Date.now() * 1000000),
      };

      addMember({ teamId: selectedTeam, member }, {
        onSuccess: () => {
          toast.success('Member added successfully');
          setMemberPrincipal('');
          setIsMemberDialogOpen(false);
        },
        onError: () => {
          toast.error('Failed to add member');
        },
      });
    } catch (error) {
      toast.error('Invalid principal ID');
    }
  };

  const handleShareEntry = () => {
    if (!selectedEntry || !selectedTeam) {
      toast.error('Please select an entry and team');
      return;
    }

    const entry = vaultEntries?.find(e => e.id === selectedEntry);
    const team = teams?.find(t => t.id === selectedTeam);
    
    if (!entry || !team) {
      toast.error('Entry or team not found');
      return;
    }

    const sharedWith = team.members.map(m => m.principal);
    const permissions = [sharePermission];

    shareEntry({ entry, sharedWith, permissions }, {
      onSuccess: () => {
        toast.success('Entry shared successfully');
        setIsShareDialogOpen(false);
      },
      onError: () => {
        toast.error('Failed to share entry');
      },
    });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold mb-2">Team & Sharing</h1>
        <p className="text-muted-foreground">Collaborate securely with family and team members</p>
      </div>

      {/* Stats Cards */}
      <div className="grid md:grid-cols-3 gap-4">
        <Card className="border-border/40 glass-strong shadow-depth-md card-tactile gradient-primary">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-3">
              <Users className="h-7 w-7 text-primary" />
              <Badge variant="secondary" className="text-xs">{teams?.length || 0} teams</Badge>
            </div>
            <div className="text-3xl font-bold mb-1">{totalMembers}</div>
            <div className="text-sm text-muted-foreground">Team Members</div>
          </CardContent>
        </Card>

        <Card className="border-border/40 glass-strong shadow-depth-md card-tactile gradient-success">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-3">
              <Shield className="h-7 w-7 text-success" />
              <Badge variant="secondary" className="text-xs">Encrypted</Badge>
            </div>
            <div className="text-3xl font-bold mb-1">{totalShared}</div>
            <div className="text-sm text-muted-foreground">Shared Items</div>
          </CardContent>
        </Card>

        <Card className="border-border/40 glass-strong shadow-depth-md card-tactile gradient-warning">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-3">
              <Clock className="h-7 w-7 text-warning" />
              <Badge variant="secondary" className="text-xs">Live</Badge>
            </div>
            <div className="text-3xl font-bold mb-1">24/7</div>
            <div className="text-sm text-muted-foreground">Access Monitoring</div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs defaultValue="teams" className="space-y-6">
        <TabsList className="glass-effect border border-border/40">
          <TabsTrigger value="teams">Teams</TabsTrigger>
          <TabsTrigger value="shared">Shared Items</TabsTrigger>
          <TabsTrigger value="audit">Audit Trail</TabsTrigger>
        </TabsList>

        <TabsContent value="teams" className="space-y-4">
          <Card className="border-border/40 glass-strong shadow-depth-md">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Your Teams</CardTitle>
                  <CardDescription>Manage team members and permissions</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Dialog open={isTeamDialogOpen} onOpenChange={setIsTeamDialogOpen}>
                    <DialogTrigger asChild>
                      <Button className="rounded-full btn-press">
                        <UserPlus className="h-4 w-4 mr-2" />
                        Create Team
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="glass-strong border-border/40">
                      <DialogHeader>
                        <DialogTitle>Create New Team</DialogTitle>
                        <DialogDescription>Set up a team for secure collaboration</DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div className="space-y-2">
                          <Label>Team Name</Label>
                          <Input
                            placeholder="e.g., Smith Family"
                            value={teamName}
                            onChange={(e) => setTeamName(e.target.value)}
                            disabled={isCreating}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Team Type</Label>
                          <Select value={teamType} onValueChange={(v: any) => setTeamType(v)} disabled={isCreating}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Family">Family</SelectItem>
                              <SelectItem value="Team">Team</SelectItem>
                              <SelectItem value="Enterprise">Enterprise</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <DialogFooter>
                        <Button onClick={handleCreateTeam} disabled={isCreating} className="rounded-full">
                          {isCreating ? 'Creating...' : 'Create Team'}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {teams && teams.length > 0 ? (
                <ScrollArea className="h-[400px]">
                  <div className="space-y-3">
                    {teams.map((team) => (
                      <TeamCard 
                        key={team.id} 
                        team={team} 
                        onAddMember={() => {
                          setSelectedTeam(team.id);
                          setIsMemberDialogOpen(true);
                        }}
                      />
                    ))}
                  </div>
                </ScrollArea>
              ) : (
                <EmptyState
                  icon={Users}
                  title="No teams yet"
                  description="Create your first team to start collaborating securely"
                  action="Create Team"
                  onAction={() => setIsTeamDialogOpen(true)}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="shared" className="space-y-4">
          <Card className="border-border/40 glass-strong shadow-depth-md">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Shared Vault Items</CardTitle>
                  <CardDescription>Items you've shared with teams</CardDescription>
                </div>
                <Dialog open={isShareDialogOpen} onOpenChange={setIsShareDialogOpen}>
                  <DialogTrigger asChild>
                    <Button className="rounded-full btn-press">
                      <Share2 className="h-4 w-4 mr-2" />
                      Share Item
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="glass-strong border-border/40">
                    <DialogHeader>
                      <DialogTitle>Share Vault Item</DialogTitle>
                      <DialogDescription>Grant team access to a vault entry</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label>Select Entry</Label>
                        <Select value={selectedEntry} onValueChange={setSelectedEntry} disabled={isSharing}>
                          <SelectTrigger>
                            <SelectValue placeholder="Choose an entry" />
                          </SelectTrigger>
                          <SelectContent>
                            {vaultEntries?.map((entry) => (
                              <SelectItem key={entry.id} value={entry.id}>
                                {entry.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Select Team</Label>
                        <Select value={selectedTeam} onValueChange={setSelectedTeam} disabled={isSharing}>
                          <SelectTrigger>
                            <SelectValue placeholder="Choose a team" />
                          </SelectTrigger>
                          <SelectContent>
                            {teams?.map((team) => (
                              <SelectItem key={team.id} value={team.id}>
                                {team.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Permission Level</Label>
                        <Select value={sharePermission} onValueChange={(v: any) => setSharePermission(v)} disabled={isSharing}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="view">View Only</SelectItem>
                            <SelectItem value="edit">View & Edit</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button onClick={handleShareEntry} disabled={isSharing} className="rounded-full">
                        {isSharing ? 'Sharing...' : 'Share Item'}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              {sharedEntries && sharedEntries.length > 0 ? (
                <ScrollArea className="h-[400px]">
                  <div className="space-y-3">
                    {sharedEntries.map((shared) => (
                      <SharedItemCard key={shared.entry.id} sharedEntry={shared} />
                    ))}
                  </div>
                </ScrollArea>
              ) : (
                <EmptyState
                  icon={Share2}
                  title="No shared items"
                  description="Share vault entries with your teams for secure collaboration"
                  action="Share Item"
                  onAction={() => setIsShareDialogOpen(true)}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="audit" className="space-y-4">
          <AuditTrailSection />
        </TabsContent>
      </Tabs>

      {/* Add Member Dialog */}
      <Dialog open={isMemberDialogOpen} onOpenChange={setIsMemberDialogOpen}>
        <DialogContent className="glass-strong border-border/40">
          <DialogHeader>
            <DialogTitle>Add Team Member</DialogTitle>
            <DialogDescription>Invite someone to join your team</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Principal ID</Label>
              <Input
                placeholder="Enter principal ID"
                value={memberPrincipal}
                onChange={(e) => setMemberPrincipal(e.target.value)}
                disabled={isAddingMember}
              />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={memberRole} onValueChange={(v: any) => setMemberRole(v)} disabled={isAddingMember}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="view">View Only</SelectItem>
                  <SelectItem value="edit">Editor</SelectItem>
                  <SelectItem value="owner">Owner</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleAddMember} disabled={isAddingMember} className="rounded-full">
              {isAddingMember ? 'Adding...' : 'Add Member'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AuditTrailSection() {
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);

  useEffect(() => {
    setAuditEvents(getAuditLog());
    // Poll every 5 seconds for new events
    const interval = setInterval(() => setAuditEvents(getAuditLog()), 5000);
    return () => clearInterval(interval);
  }, []);

  const getResultIcon = (result: AuditEvent['result']) => {
    switch (result) {
      case 'success': return <CheckCircle2 className="h-4 w-4 text-success" />;
      case 'denied': return <XCircle className="h-4 w-4 text-destructive" />;
      case 'error': return <AlertTriangle className="h-4 w-4 text-warning" />;
    }
  };

  const getResultBadge = (result: AuditEvent['result']) => {
    const variants: Record<string, string> = {
      success: 'bg-success/10 text-success border-success/20',
      denied: 'bg-destructive/10 text-destructive border-destructive/20',
      error: 'bg-warning/10 text-warning border-warning/20',
    };
    return variants[result] ?? '';
  };

  return (
    <Card className="border-border/40 glass-strong shadow-depth-md">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Access Audit Trail</CardTitle>
            <CardDescription>Real-time event stream from all operations ({auditEvents.length} events)</CardDescription>
          </div>
          <Badge variant="secondary" className="text-xs">
            <Clock className="h-3 w-3 mr-1" />
            Live
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {auditEvents.length > 0 ? (
          <ScrollArea className="h-[400px]">
            <div className="space-y-2">
              {auditEvents.slice(0, 50).map((event) => (
                <div key={event.id} className="p-3 rounded-xl glass-effect border border-border/40 shadow-depth-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2 flex-1 min-w-0">
                      {getResultIcon(event.result)}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-medium font-mono">{event.action}</span>
                          <Badge variant="outline" className={`text-xs border ${getResultBadge(event.result)}`}>
                            {event.result}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground truncate">{event.details}</p>
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                          <span>{event.actorEmail}</span>
                          <span>{event.actorRole}</span>
                          {event.resourceType && (
                            <Badge variant="secondary" className="text-xs">{event.resourceType}</Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(event.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        ) : (
          <EmptyState
            icon={Clock}
            title="No audit logs yet"
            description="Events will appear here as you interact with the vault, teams, and passkeys"
          />
        )}
      </CardContent>
    </Card>
  );
}

function TeamCard({ team, onAddMember }: any) {
  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'owner': return <Crown className="h-3.5 w-3.5 text-warning" />;
      case 'edit': return <Edit className="h-3.5 w-3.5 text-primary" />;
      default: return <Eye className="h-3.5 w-3.5 text-muted-foreground" />;
    }
  };

  return (
    <div className="p-4 rounded-xl border border-border/40 glass-effect shadow-depth-sm card-tactile animate-slide-in">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-xl bg-primary/10 shadow-depth-sm">
            <Users className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h4 className="font-semibold mb-1">{team.name}</h4>
            <p className="text-xs text-muted-foreground">
              Created {new Date(Number(team.createdAt) / 1000000).toLocaleDateString()}
            </p>
          </div>
        </div>
        <Button size="sm" variant="ghost" onClick={onAddMember} className="rounded-full btn-press">
          <UserPlus className="h-4 w-4" />
        </Button>
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
          <span>Members ({team.members.length})</span>
          <Badge variant="secondary" className="text-xs">
            <Shield className="h-3 w-3 mr-1" />
            Encrypted
          </Badge>
        </div>
        {team.members.slice(0, 3).map((member: TeamMember, idx: number) => (
          <div key={idx} className="flex items-center gap-2 p-2 rounded-lg bg-background/50">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              {getRoleIcon(member.role)}
              <span className="text-xs font-mono truncate">{member.principal.toString().slice(0, 20)}...</span>
            </div>
            <Badge variant="outline" className="text-xs">{member.role}</Badge>
          </div>
        ))}
        {team.members.length > 3 && (
          <p className="text-xs text-muted-foreground text-center pt-1">
            +{team.members.length - 3} more
          </p>
        )}
      </div>
    </div>
  );
}

function SharedItemCard({ sharedEntry }: any) {
  return (
    <div className="p-4 rounded-xl border border-border/40 glass-effect shadow-depth-sm card-tactile animate-slide-in">
      <div className="flex items-start gap-3">
        <div className="p-2.5 rounded-xl bg-success/10 shadow-depth-sm">
          <Lock className="h-5 w-5 text-success" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <h4 className="font-semibold">{sharedEntry.entry.name}</h4>
            <Badge variant="secondary" className="text-xs">{sharedEntry.entry.category}</Badge>
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3" />
              {sharedEntry.sharedWith.length} members
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {new Date(Number(sharedEntry.sharedAt) / 1000000).toLocaleDateString()}
            </span>
          </div>
          <div className="flex gap-1 mt-2">
            {sharedEntry.permissions.map((perm: string, idx: number) => (
              <Badge key={idx} variant="outline" className="text-xs">
                {perm}
              </Badge>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ icon: Icon, title, description, action, onAction }: any) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="p-6 rounded-2xl bg-muted/20 mb-4">
        <Icon className="h-12 w-12 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground mb-4 max-w-md">{description}</p>
      {action && onAction && (
        <Button onClick={onAction} className="rounded-full btn-press">
          {action}
        </Button>
      )}
    </div>
  );
}
