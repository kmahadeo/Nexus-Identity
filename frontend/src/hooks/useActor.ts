import { useState, useEffect } from 'react';
import { HttpAgent, Actor, type ActorSubclass } from '@dfinity/agent';
import { useInternetIdentity } from './useInternetIdentity';
import type { NexusIdentityActor } from '../backend';
import { IDL } from '@dfinity/candid';
import { CANISTER_ID_BACKEND, ICP_HOST, IS_LOCAL } from '../config';

// Placeholder IDL factory - will be replaced by dfx-generated declarations
// after running `dfx generate backend`
const idlFactory = ({ IDL }: { IDL: any }) => {
  const UserProfile = IDL.Record({
    name: IDL.Text,
    email: IDL.Text,
    tier: IDL.Text,
    createdAt: IDL.Int,
    lastLogin: IDL.Int,
  });
  const VaultEntry = IDL.Record({
    id: IDL.Text,
    name: IDL.Text,
    category: IDL.Text,
    encryptedData: IDL.Text,
    createdAt: IDL.Int,
    updatedAt: IDL.Int,
  });
  const ActivityLogEntry = IDL.Record({
    timestamp: IDL.Int,
    action: IDL.Text,
    details: IDL.Text,
  });
  const SecurityRecommendation = IDL.Record({
    id: IDL.Text,
    message: IDL.Text,
    priority: IDL.Nat,
  });
  const UserDashboardData = IDL.Record({
    securityScore: IDL.Nat,
    recentActivity: IDL.Vec(ActivityLogEntry),
    recommendations: IDL.Vec(SecurityRecommendation),
  });
  const TeamMember = IDL.Record({
    principal: IDL.Principal,
    role: IDL.Text,
    addedAt: IDL.Int,
  });
  const Team = IDL.Record({
    id: IDL.Text,
    name: IDL.Text,
    owner: IDL.Principal,
    members: IDL.Vec(TeamMember),
    createdAt: IDL.Int,
  });
  const SharedVaultEntry = IDL.Record({
    entry: VaultEntry,
    sharedWith: IDL.Vec(IDL.Principal),
    permissions: IDL.Vec(IDL.Text),
    sharedAt: IDL.Int,
  });
  const PasskeyCredential = IDL.Record({
    credentialId: IDL.Text,
    publicKeyHint: IDL.Text,
    deviceName: IDL.Text,
    createdAt: IDL.Int,
    lastUsed: IDL.Int,
    transports: IDL.Vec(IDL.Text),
  });
  const AIContext = IDL.Record({
    vaultHealth: IDL.Text,
    authEvents: IDL.Text,
    deviceData: IDL.Text,
  });
  const AIResponse = IDL.Record({
    advice: IDL.Text,
    riskScore: IDL.Nat,
    confidence: IDL.Nat,
  });

  return IDL.Service({
    initializeAccessControl: IDL.Func([], [], []),
    getCallerUserRole: IDL.Func([], [IDL.Text], ['query']),
    isCallerAdmin: IDL.Func([], [IDL.Bool], ['query']),
    getCallerUserProfile: IDL.Func([], [IDL.Opt(UserProfile)], ['query']),
    getUserProfile: IDL.Func([IDL.Principal], [IDL.Opt(UserProfile)], ['query']),
    saveCallerUserProfile: IDL.Func([UserProfile], [], []),
    addVaultEntry: IDL.Func([VaultEntry], [], []),
    getVaultEntries: IDL.Func([], [IDL.Vec(VaultEntry)], ['query']),
    deleteVaultEntry: IDL.Func([IDL.Text], [], []),
    logActivity: IDL.Func([IDL.Text, IDL.Text], [], []),
    getRecentActivity: IDL.Func([], [IDL.Vec(ActivityLogEntry)], ['query']),
    addRecommendation: IDL.Func([SecurityRecommendation], [], []),
    getRecommendations: IDL.Func([], [IDL.Vec(SecurityRecommendation)], ['query']),
    getDashboardData: IDL.Func([], [UserDashboardData], ['query']),
    createTeam: IDL.Func([IDL.Text], [IDL.Text], []),
    getTeams: IDL.Func([], [IDL.Vec(Team)], ['query']),
    addTeamMember: IDL.Func([IDL.Text, TeamMember], [], []),
    shareVaultEntry: IDL.Func([VaultEntry, IDL.Vec(IDL.Principal), IDL.Vec(IDL.Text)], [], []),
    getSharedVaultEntries: IDL.Func([], [IDL.Vec(SharedVaultEntry)], ['query']),
    addPasskeyCredential: IDL.Func([PasskeyCredential], [], []),
    getPasskeyCredentials: IDL.Func([], [IDL.Vec(PasskeyCredential)], ['query']),
    deletePasskeyCredential: IDL.Func([IDL.Text], [], []),
    getPasskeyCount: IDL.Func([], [IDL.Nat], ['query']),
    generateInviteCode: IDL.Func([], [IDL.Text], []),
    getAIRecommendations: IDL.Func([AIContext], [AIResponse], []),
    makeGetOutcall: IDL.Func([IDL.Text], [IDL.Text], []),
  });
};

const canisterId = CANISTER_ID_BACKEND;
const host = ICP_HOST;

export function useActor() {
  const { identity, isInitializing } = useInternetIdentity();
  const [actor, setActor] = useState<NexusIdentityActor | null>(null);
  const [isFetching, setIsFetching] = useState(true);

  useEffect(() => {
    if (isInitializing) return;
    if (!identity) {
      setActor(null);
      setIsFetching(false);
      return;
    }

    const setup = async () => {
      try {
        const agent = await HttpAgent.create({ identity, host });

        if (IS_LOCAL) {
          await agent.fetchRootKey().catch(console.error);
        }

        const actorInstance = Actor.createActor<NexusIdentityActor>(idlFactory, {
          agent,
          canisterId,
        });

        setActor(actorInstance);
      } catch (err) {
        console.error('Failed to create actor:', err);
      } finally {
        setIsFetching(false);
      }
    };

    setup();
  }, [identity, isInitializing]);

  return { actor, isFetching };
}
