import { useState } from 'react';
import { useGetTeams, useCreateTeam, useAddTeamMember, useRenameTeam, useRemoveTeamMember, useDeleteTeam, useGetSharedVaultEntries, useShareVaultEntry, useGetVaultEntries } from './hooks/useQueries';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Users, UserPlus, Shield, Clock, Eye, Edit, Crown, Share2, Lock, AlertTriangle, Mail, CheckCircle2, Pencil, X, Trash2, Check, UserCog } from 'lucide-react';
import { toast } from 'sonner';
import type { TeamMember } from './backend';
import { roleRegistry } from './lib/storage';

export default function TeamSharing() {
  const { data: teams } = useGetTeams();
  const { data: sharedEntries } = useGetSharedVaultEntries();
  const { data: vaultEntries } = useGetVaultEntries();
  const { mutate: createTeam, isPending: isCreating } = useCreateTeam();
  const { mutate: addMember, isPending: isAddingMember } = useAddTeamMember();
  const { mutate: renameTeam } = useRenameTeam();
  const { mutate: removeTeamMember } = useRemoveTeamMember();
  const { mutate: deleteTeam } = useDeleteTeam();
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
  const [deleteTargetTeam, setDeleteTargetTeam] = useState<string | null>(null);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);

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

    const email = memberPrincipal.trim().toLowerCase();
    // Look up registered user by email
    const existing = roleRegistry.get(email);
    const principalId = existing?.principalId ?? `nexus-ext-${btoa(email).replace(/[^a-z0-9]/gi, '').slice(0, 12)}`;
    const displayName  = existing?.name ?? email;

    const member: TeamMember = {
      principalId,
      principal: principalId,
      name: displayName,
      email,
      role: memberRole,
      joinedAt: BigInt(Date.now()) * 1_000_000n,
    };

    addMember({ teamId: selectedTeam, member }, {
      onSuccess: () => {
        const team = teams?.find(t => t.id === selectedTeam);
        // Log audit event
        logTeamAudit({
          action: `Invited ${displayName} to "${team?.name ?? 'team'}" as ${memberRole}`,
          actor: 'You',
          target: team?.name ?? selectedTeam,
          type: 'invite',
        });
        // Create pending invite if not registered
        if (!existing && team) {
          addPendingInvite({ email, teamId: selectedTeam, teamName: team.name, role: memberRole });
        }
        toast.success(`${displayName} added${existing ? '' : ' (pending — invitation sent)'}`);
        setMemberPrincipal('');
        setIsMemberDialogOpen(false);
      },
      onError: () => {
        toast.error('Failed to add member');
      },
    });
  };

  const handleRenameTeam = (teamId: string, newName: string) => {
    if (!newName.trim()) {
      toast.error('Team name cannot be empty');
      return;
    }
    const team = teams?.find(t => t.id === teamId);
    renameTeam({ teamId, newName: newName.trim() }, {
      onSuccess: () => {
        logTeamAudit({
          action: `Renamed team "${team?.name ?? 'Unknown'}" to "${newName.trim()}"`,
          actor: 'You',
          target: newName.trim(),
          type: 'role_change',
        });
        toast.success('Team renamed successfully');
      },
      onError: () => toast.error('Failed to rename team'),
    });
  };

  const handleRemoveMember = (teamId: string, member: TeamMember) => {
    const team = teams?.find(t => t.id === teamId);
    removeTeamMember({ teamId, principalId: member.principalId }, {
      onSuccess: () => {
        logTeamAudit({
          action: `Removed ${member.name || member.email || 'member'} from "${team?.name ?? 'team'}"`,
          actor: 'You',
          target: team?.name ?? teamId,
          type: 'remove',
        });
        toast.success(`${member.name || member.email || 'Member'} removed from team`);
      },
      onError: () => toast.error('Failed to remove member'),
    });
  };

  const handleDeleteTeam = () => {
    if (!deleteTargetTeam) return;
    const team = teams?.find(t => t.id === deleteTargetTeam);
    deleteTeam(deleteTargetTeam, {
      onSuccess: () => {
        logTeamAudit({
          action: `Deleted team "${team?.name ?? 'Unknown'}"`,
          actor: 'You',
          target: team?.name ?? deleteTargetTeam,
          type: 'remove',
        });
        toast.success('Team deleted');
        setIsDeleteConfirmOpen(false);
        setDeleteTargetTeam(null);
      },
      onError: () => toast.error('Failed to delete team'),
    });
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
        logTeamAudit({
          action: `Shared "${entry.name}" with team "${team.name}" (${sharePermission})`,
          actor: 'You',
          target: entry.name,
          type: 'share',
        });
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
          <TabsTrigger value="members">Members</TabsTrigger>
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
                        onRename={(newName: string) => handleRenameTeam(team.id, newName)}
                        onRemoveMember={(member: TeamMember) => handleRemoveMember(team.id, member)}
                        onDeleteTeam={() => {
                          setDeleteTargetTeam(team.id);
                          setIsDeleteConfirmOpen(true);
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

        <TabsContent value="members" className="space-y-4">
          <Card className="border-border/40 glass-strong shadow-depth-md">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>All Members</CardTitle>
                  <CardDescription>Overview of all members across all teams</CardDescription>
                </div>
                <Badge variant="secondary" className="text-xs">
                  <UserCog className="h-3 w-3 mr-1" />
                  {totalMembers} total
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <AllMembersTable teams={teams ?? []} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="audit" className="space-y-4">
          <Card className="border-border/40 glass-strong shadow-depth-md">
            <CardHeader>
              <CardTitle>Access Audit Trail</CardTitle>
              <CardDescription>Track who accessed what and when</CardDescription>
            </CardHeader>
            <CardContent>
              <AuditTrail teams={teams ?? []} sharedEntries={sharedEntries ?? []} />
            </CardContent>
          </Card>
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
              <Label>Email Address</Label>
              <Input
                placeholder="user@example.com"
                type="email"
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

      {/* Delete Team Confirmation Dialog */}
      <Dialog open={isDeleteConfirmOpen} onOpenChange={setIsDeleteConfirmOpen}>
        <DialogContent className="glass-strong border-border/40">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Delete Team
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{teams?.find(t => t.id === deleteTargetTeam)?.name}"? This will remove all members and cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setIsDeleteConfirmOpen(false)} className="rounded-full">
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteTeam} className="rounded-full btn-press">
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Team
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TeamCard({ team, onAddMember, onRename, onRemoveMember, onDeleteTeam }: any) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(team.name);
  const [showAllMembers, setShowAllMembers] = useState(false);

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'owner': return <Crown className="h-3.5 w-3.5 text-warning" />;
      case 'edit': return <Edit className="h-3.5 w-3.5 text-primary" />;
      default: return <Eye className="h-3.5 w-3.5 text-muted-foreground" />;
    }
  };

  const handleSaveRename = () => {
    if (editName.trim() && editName.trim() !== team.name) {
      onRename(editName.trim());
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSaveRename();
    if (e.key === 'Escape') { setEditName(team.name); setIsEditing(false); }
  };

  const visibleMembers = showAllMembers ? team.members : team.members.slice(0, 3);

  return (
    <div className="p-4 rounded-xl border border-border/40 glass-effect shadow-depth-sm card-tactile animate-slide-in">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-xl bg-primary/10 shadow-depth-sm">
            <Users className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            {isEditing ? (
              <div className="flex items-center gap-1.5">
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={handleKeyDown}
                  autoFocus
                  className="h-7 text-sm font-semibold px-2 py-1"
                />
                <Button size="icon" variant="ghost" onClick={handleSaveRename} className="h-7 w-7 rounded-full btn-press shrink-0">
                  <Check className="h-3.5 w-3.5 text-success" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => { setEditName(team.name); setIsEditing(false); }} className="h-7 w-7 rounded-full btn-press shrink-0">
                  <X className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <h4 className="font-semibold mb-1">{team.name}</h4>
                <Button size="icon" variant="ghost" onClick={() => setIsEditing(true)} className="h-6 w-6 rounded-full btn-press opacity-60 hover:opacity-100">
                  <Pencil className="h-3 w-3" />
                </Button>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Created {new Date(Number(team.createdAt) / 1000000).toLocaleDateString()}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={onAddMember} className="rounded-full btn-press" title="Add member">
            <UserPlus className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="ghost" onClick={onDeleteTeam} className="rounded-full btn-press text-destructive/60 hover:text-destructive" title="Delete team">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
          <span>Members ({team.members.length})</span>
          <Badge variant="secondary" className="text-xs">
            <Shield className="h-3 w-3 mr-1" />
            Encrypted
          </Badge>
        </div>
        {visibleMembers.map((member: TeamMember, idx: number) => (
          <div key={idx} className="flex items-center gap-2 p-2 rounded-lg bg-background/50 group">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              {getRoleIcon(member.role)}
              <span className="text-xs truncate">{member.name || member.email || member.principal?.toString().slice(0, 20)}</span>
            </div>
            <Badge variant="outline" className="text-xs">{member.role}</Badge>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => onRemoveMember(member)}
              className="h-6 w-6 rounded-full btn-press opacity-0 group-hover:opacity-100 transition-opacity text-destructive/60 hover:text-destructive"
              title="Remove member"
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        ))}
        {team.members.length > 3 && (
          <button
            onClick={() => setShowAllMembers(!showAllMembers)}
            className="text-xs text-primary hover:text-primary/80 text-center pt-1 w-full cursor-pointer"
          >
            {showAllMembers ? 'Show less' : `+${team.members.length - 3} more`}
          </button>
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

/* ── Audit trail ───────────────────────────────────────────────────────── */

interface AuditEvent {
  id: string;
  action: string;
  actor: string;
  target: string;
  timestamp: number;
  type: 'share' | 'access' | 'invite' | 'role_change' | 'remove';
}

const AUDIT_KEY = 'nexus-team-audit';

export function logTeamAudit(event: Omit<AuditEvent, 'id' | 'timestamp'>) {
  try {
    const all: AuditEvent[] = JSON.parse(localStorage.getItem(AUDIT_KEY) ?? '[]');
    all.unshift({ ...event, id: crypto.randomUUID(), timestamp: Date.now() });
    localStorage.setItem(AUDIT_KEY, JSON.stringify(all.slice(0, 200)));
  } catch {}
}

function AuditTrail({ teams, sharedEntries }: { teams: any[]; sharedEntries: any[] }) {
  const events: AuditEvent[] = (() => {
    try { return JSON.parse(localStorage.getItem(AUDIT_KEY) ?? '[]'); } catch { return []; }
  })();

  // Seed from existing data if empty
  const allEvents = events.length > 0 ? events : [
    ...teams.flatMap(t => t.members.map((m: any, i: number) => ({
      id: `seed-invite-${t.id}-${i}`,
      action: `Joined team "${t.name}"`,
      actor: m.name || m.email || 'Unknown',
      target: t.name,
      timestamp: Number(t.createdAt) / 1000000 + i * 60000,
      type: 'invite' as const,
    }))),
    ...sharedEntries.map((s: any, i: number) => ({
      id: `seed-share-${i}`,
      action: `Shared "${s.entry.name}" with ${s.sharedWith.length} members`,
      actor: 'You',
      target: s.entry.name,
      timestamp: Number(s.sharedAt) / 1000000,
      type: 'share' as const,
    })),
  ].sort((a, b) => b.timestamp - a.timestamp);

  const typeIcon: Record<string, any> = {
    share: Share2, access: Eye, invite: UserPlus, role_change: Edit, remove: AlertTriangle,
  };
  const typeColor: Record<string, string> = {
    share: 'text-primary', access: 'text-emerald-400', invite: 'text-cyan-400',
    role_change: 'text-amber-400', remove: 'text-red-400',
  };

  if (allEvents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="p-6 rounded-2xl bg-muted/20 mb-4"><Clock className="h-12 w-12 text-muted-foreground" /></div>
        <h3 className="text-lg font-semibold mb-2">No audit logs yet</h3>
        <p className="text-sm text-muted-foreground max-w-md">Access history will appear here as team members interact with shared items</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-[400px]">
      <div className="space-y-1.5">
        {allEvents.slice(0, 50).map((event) => {
          const Icon = typeIcon[event.type] ?? Clock;
          const color = typeColor[event.type] ?? 'text-muted-foreground';
          return (
            <div key={event.id} className="flex items-start gap-3 p-3 rounded-lg glass-effect border border-border/40">
              <div className={`p-1.5 rounded-md bg-white/5 mt-0.5 ${color}`}>
                <Icon className="h-3.5 w-3.5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white/70">{event.action}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-white/35">{event.actor}</span>
                  <span className="text-xs text-white/15">·</span>
                  <span className="text-xs text-white/25">{new Date(event.timestamp).toLocaleString()}</span>
                </div>
              </div>
              <Badge variant="secondary" className="text-[10px] capitalize shrink-0">{event.type.replace('_', ' ')}</Badge>
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}

/* ── Pending invitations section ──────────────────────────────────────── */

const INVITE_KEY = 'nexus-pending-invites';

interface PendingInvite {
  id: string;
  email: string;
  teamId: string;
  teamName: string;
  role: string;
  invitedAt: number;
  status: 'pending' | 'accepted' | 'declined';
}

export function getPendingInvites(): PendingInvite[] {
  try { return JSON.parse(localStorage.getItem(INVITE_KEY) ?? '[]'); } catch { return []; }
}

export function addPendingInvite(invite: Omit<PendingInvite, 'id' | 'invitedAt' | 'status'>): PendingInvite {
  const full: PendingInvite = {
    ...invite,
    id: crypto.randomUUID(),
    invitedAt: Date.now(),
    status: 'pending',
  };
  const all = getPendingInvites();
  all.push(full);
  localStorage.setItem(INVITE_KEY, JSON.stringify(all));
  return full;
}

function AllMembersTable({ teams }: { teams: any[] }) {
  // Flatten all members across all teams, annotating with team info
  const allMembers = teams.flatMap(team =>
    team.members.map((member: TeamMember) => ({
      ...member,
      teamId: team.id,
      teamName: team.name,
    })),
  );

  // Group by principalId to show team(s) per member
  const memberMap = new Map<string, { member: TeamMember; teams: string[] }>();
  allMembers.forEach((m: any) => {
    const key = m.principalId || m.email || m.principal?.toString();
    const existing = memberMap.get(key);
    if (existing) {
      if (!existing.teams.includes(m.teamName)) existing.teams.push(m.teamName);
    } else {
      memberMap.set(key, { member: m, teams: [m.teamName] });
    }
  });

  const uniqueMembers = Array.from(memberMap.values());

  if (uniqueMembers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="p-6 rounded-2xl bg-muted/20 mb-4">
          <UserCog className="h-12 w-12 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold mb-2">No members yet</h3>
        <p className="text-sm text-muted-foreground max-w-md">Add members to your teams to see them here</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-[400px]">
      {/* Table header */}
      <div className="grid grid-cols-[1fr_1fr_1fr_80px_100px] gap-2 px-3 py-2 text-xs font-medium text-muted-foreground border-b border-border/40 mb-1 sticky top-0 bg-background/80 backdrop-blur-sm z-10">
        <span>Name</span>
        <span>Email</span>
        <span>Team(s)</span>
        <span>Role</span>
        <span>Joined</span>
      </div>
      <div className="space-y-1">
        {uniqueMembers.map(({ member, teams: memberTeams }, idx) => (
          <div
            key={member.principalId || idx}
            className="grid grid-cols-[1fr_1fr_1fr_80px_100px] gap-2 px-3 py-2.5 rounded-lg glass-effect border border-border/40 items-center animate-slide-in"
          >
            <span className="text-sm truncate font-medium">
              {member.name || 'Unknown'}
            </span>
            <span className="text-xs text-muted-foreground truncate">
              {member.email || '-'}
            </span>
            <div className="flex flex-wrap gap-1">
              {memberTeams.map((t, i) => (
                <Badge key={i} variant="secondary" className="text-[10px]">{t}</Badge>
              ))}
            </div>
            <Badge variant="outline" className="text-xs w-fit capitalize">{member.role}</Badge>
            <span className="text-xs text-muted-foreground">
              {member.joinedAt
                ? new Date(Number(member.joinedAt) / 1000000).toLocaleDateString()
                : '-'}
            </span>
          </div>
        ))}
      </div>
    </ScrollArea>
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
