import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useActor } from './useActor';
import type { 
  UserProfile, 
  VaultEntry, 
  UserDashboardData, 
  Team, 
  TeamMember, 
  SharedVaultEntry,
  SecurityRecommendation,
  AIContext,
  AIResponse
} from '../backend';
import { Principal } from '@icp-sdk/core/principal';

export function useGetCallerUserProfile() {
  const { actor, isFetching: actorFetching } = useActor();

  const query = useQuery<UserProfile | null>({
    queryKey: ['currentUserProfile'],
    queryFn: async () => {
      if (!actor) throw new Error('Actor not available');
      return actor.getCallerUserProfile();
    },
    enabled: !!actor && !actorFetching,
    retry: false,
  });

  return {
    ...query,
    isLoading: actorFetching || query.isLoading,
    isFetched: !!actor && query.isFetched,
  };
}

export function useSaveCallerUserProfile() {
  const { actor } = useActor();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (profile: UserProfile) => {
      if (!actor) throw new Error('Actor not available');
      await actor.saveCallerUserProfile(profile);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['currentUserProfile'] });
    },
  });
}

export function useIsCurrentUserAdmin() {
  const { actor, isFetching } = useActor();

  return useQuery<boolean>({
    queryKey: ['isCurrentUserAdmin'],
    queryFn: async () => {
      if (!actor) throw new Error('Actor not available');
      return actor.isCallerAdmin();
    },
    enabled: !!actor && !isFetching,
  });
}

export function useGetDashboardData() {
  const { actor, isFetching } = useActor();

  return useQuery<UserDashboardData>({
    queryKey: ['dashboardData'],
    queryFn: async () => {
      if (!actor) throw new Error('Actor not available');
      return actor.getDashboardData();
    },
    enabled: !!actor && !isFetching,
  });
}

export function useGetVaultEntries() {
  const { actor, isFetching } = useActor();

  return useQuery<VaultEntry[]>({
    queryKey: ['vaultEntries'],
    queryFn: async () => {
      if (!actor) throw new Error('Actor not available');
      return actor.getVaultEntries();
    },
    enabled: !!actor && !isFetching,
  });
}

export function useAddVaultEntry() {
  const { actor } = useActor();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (entry: VaultEntry) => {
      if (!actor) throw new Error('Actor not available');
      await actor.addVaultEntry(entry);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vaultEntries'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardData'] });
      queryClient.invalidateQueries({ queryKey: ['recommendations'] });
      queryClient.invalidateQueries({ queryKey: ['aiRecommendations'] });
    },
  });
}

export function useDeleteVaultEntry() {
  const { actor } = useActor();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (entryId: string) => {
      if (!actor) throw new Error('Actor not available');
      await actor.deleteVaultEntry(entryId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vaultEntries'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardData'] });
      queryClient.invalidateQueries({ queryKey: ['recommendations'] });
      queryClient.invalidateQueries({ queryKey: ['aiRecommendations'] });
    },
  });
}

export function useLogActivity() {
  const { actor } = useActor();

  return useMutation({
    mutationFn: async ({ action, details }: { action: string; details: string }) => {
      if (!actor) throw new Error('Actor not available');
      await actor.logActivity(action, details);
    },
  });
}

export function useGetRecommendations() {
  const { actor, isFetching } = useActor();

  return useQuery<SecurityRecommendation[]>({
    queryKey: ['recommendations'],
    queryFn: async () => {
      if (!actor) throw new Error('Actor not available');
      return actor.getRecommendations();
    },
    enabled: !!actor && !isFetching,
  });
}

export function useAddRecommendation() {
  const { actor } = useActor();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (recommendation: SecurityRecommendation) => {
      if (!actor) throw new Error('Actor not available');
      await actor.addRecommendation(recommendation);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recommendations'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardData'] });
    },
  });
}

// Team & Sharing hooks
export function useGetTeams() {
  const { actor, isFetching } = useActor();

  return useQuery<Team[]>({
    queryKey: ['teams'],
    queryFn: async () => {
      if (!actor) throw new Error('Actor not available');
      return actor.getTeams();
    },
    enabled: !!actor && !isFetching,
  });
}

export function useCreateTeam() {
  const { actor } = useActor();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (name: string) => {
      if (!actor) throw new Error('Actor not available');
      return actor.createTeam(name);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
    },
  });
}

export function useAddTeamMember() {
  const { actor } = useActor();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ teamId, member }: { teamId: string; member: TeamMember }) => {
      if (!actor) throw new Error('Actor not available');
      await actor.addTeamMember(teamId, member);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
    },
  });
}

export function useGetSharedVaultEntries() {
  const { actor, isFetching } = useActor();

  return useQuery<SharedVaultEntry[]>({
    queryKey: ['sharedVaultEntries'],
    queryFn: async () => {
      if (!actor) throw new Error('Actor not available');
      return actor.getSharedVaultEntries();
    },
    enabled: !!actor && !isFetching,
  });
}

export function useShareVaultEntry() {
  const { actor } = useActor();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      entry, 
      sharedWith, 
      permissions 
    }: { 
      entry: VaultEntry; 
      sharedWith: Principal[]; 
      permissions: string[] 
    }) => {
      if (!actor) throw new Error('Actor not available');
      await actor.shareVaultEntry(entry, sharedWith, permissions);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sharedVaultEntries'] });
    },
  });
}

// AI Integration with ChatAnywhere API via backend AIClient
export function useGetAIRecommendations() {
  const { actor } = useActor();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (context: AIContext) => {
      if (!actor) throw new Error('Actor not available');
      
      // Call backend getAIRecommendations which uses AIClient service
      const response = await actor.getAIRecommendations(context);
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recommendations'] });
      queryClient.invalidateQueries({ queryKey: ['aiRecommendations'] });
    },
  });
}

// Query version for automatic fetching
export function useGetAIRecommendationsQuery(context: AIContext | null) {
  const { actor, isFetching } = useActor();

  return useQuery<AIResponse>({
    queryKey: ['aiRecommendations', context],
    queryFn: async () => {
      if (!actor) throw new Error('Actor not available');
      if (!context) throw new Error('Context not available');
      
      return actor.getAIRecommendations(context);
    },
    enabled: !!actor && !isFetching && !!context,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchInterval: 10 * 60 * 1000, // Refetch every 10 minutes
  });
}

// Chat interface for interactive AI conversations
interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export function useChatWithAI() {
  const { actor } = useActor();

  return useMutation({
    mutationFn: async ({ 
      messages, 
      context 
    }: { 
      messages: ChatMessage[]; 
      context: AIContext 
    }) => {
      if (!actor) throw new Error('Actor not available');

      // Format the conversation as a single context string for the backend
      const conversationContext = messages.map(m => `${m.role}: ${m.content}`).join('\n');
      
      const aiContext: AIContext = {
        vaultHealth: context.vaultHealth || '',
        authEvents: context.authEvents || '',
        deviceData: `${context.deviceData || ''}\n\nConversation:\n${conversationContext}`,
      };

      const response = await actor.getAIRecommendations(aiContext);
      
      return {
        message: response.advice,
        riskScore: Number(response.riskScore),
        confidence: Number(response.confidence),
      };
    },
  });
}

// Auto-apply fix functionality
export function useAutoApplyFix() {
  const { actor } = useActor();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (fix: {
      type: 'password_rotation' | 'mfa_enable' | 'policy_update';
      targetId: string;
      provider?: string;
    }) => {
      if (!actor) throw new Error('Actor not available');

      // This would call backend to execute the fix via provider APIs
      // For now, we'll use the AI recommendations to simulate the action
      const context: AIContext = {
        vaultHealth: `Applying fix: ${fix.type} for ${fix.targetId}`,
        authEvents: `Fix type: ${fix.type}`,
        deviceData: `Provider: ${fix.provider || 'default'}`,
      };

      const response = await actor.getAIRecommendations(context);
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vaultEntries'] });
      queryClient.invalidateQueries({ queryKey: ['recommendations'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardData'] });
      queryClient.invalidateQueries({ queryKey: ['aiRecommendations'] });
    },
  });
}

// HTTP Outcall hook for external API integrations
export function useMakeGetOutcall() {
  const { actor } = useActor();

  return useMutation({
    mutationFn: async (url: string) => {
      if (!actor) throw new Error('Actor not available');
      return actor.makeGetOutcall(url);
    },
  });
}

// OAuth2 Integration hooks for production APIs
export function useInitiateOAuth2() {
  return useMutation({
    mutationFn: async (provider: string) => {
      throw new Error('Backend OAuth2 integration required. Please implement /auth/{provider}/authorize endpoint with secure token storage.');
    },
  });
}

// Integration status and metrics
export function useGetIntegrationStatus() {
  const { actor, isFetching } = useActor();

  return useQuery({
    queryKey: ['integrationStatus'],
    queryFn: async () => {
      if (!actor) throw new Error('Actor not available');
      throw new Error('Backend integration metrics required. Please implement live data fetching from integrated providers with real metrics.');
    },
    enabled: !!actor && !isFetching,
    retry: false,
  });
}
