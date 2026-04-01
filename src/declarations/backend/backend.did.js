export const idlFactory = ({ IDL }) => {
  const ExternalBlob = IDL.Record({
    'id' : IDL.Text,
    'url' : IDL.Text,
    'contentType' : IDL.Text,
    'size' : IDL.Nat,
  });
  const FileReference = IDL.Record({
    'id' : IDL.Text,
    'blob' : ExternalBlob,
    'name' : IDL.Text,
    'uploadedAt' : IDL.Int,
  });
  const PasskeyCredential = IDL.Record({
    'publicKeyHint' : IDL.Text,
    'createdAt' : IDL.Int,
    'transports' : IDL.Vec(IDL.Text),
    'credentialId' : IDL.Text,
    'deviceName' : IDL.Text,
    'lastUsed' : IDL.Int,
  });
  const SecurityRecommendation = IDL.Record({
    'id' : IDL.Text,
    'message' : IDL.Text,
    'priority' : IDL.Nat,
  });
  const TeamMember = IDL.Record({
    'principal' : IDL.Principal,
    'role' : IDL.Text,
    'addedAt' : IDL.Int,
  });
  const VaultEntry = IDL.Record({
    'id' : IDL.Text,
    'name' : IDL.Text,
    'createdAt' : IDL.Int,
    'updatedAt' : IDL.Int,
    'category' : IDL.Text,
    'encryptedData' : IDL.Text,
  });
  const UserRole = IDL.Variant({
    'admin' : IDL.Null,
    'user' : IDL.Null,
    'guest' : IDL.Null,
  });
  const AIContext = IDL.Record({
    'deviceData' : IDL.Text,
    'vaultHealth' : IDL.Text,
    'authEvents' : IDL.Text,
  });
  const AIResponse = IDL.Record({
    'advice' : IDL.Text,
    'confidence' : IDL.Nat,
    'riskScore' : IDL.Nat,
  });
  const Time = IDL.Int;
  const RSVP = IDL.Record({
    'name' : IDL.Text,
    'inviteCode' : IDL.Text,
    'timestamp' : Time,
    'attending' : IDL.Bool,
  });
  const UserProfile = IDL.Record({
    'name' : IDL.Text,
    'createdAt' : IDL.Int,
    'tier' : IDL.Text,
    'email' : IDL.Text,
    'lastLogin' : IDL.Int,
  });
  const ActivityLogEntry = IDL.Record({
    'action' : IDL.Text,
    'timestamp' : IDL.Int,
    'details' : IDL.Text,
  });
  const UserDashboardData = IDL.Record({
    'recommendations' : IDL.Vec(SecurityRecommendation),
    'recentActivity' : IDL.Vec(ActivityLogEntry),
    'securityScore' : IDL.Nat,
  });
  const InviteCode = IDL.Record({
    'created' : Time,
    'code' : IDL.Text,
    'used' : IDL.Bool,
  });
  const SharedVaultEntry = IDL.Record({
    'permissions' : IDL.Vec(IDL.Text),
    'sharedAt' : IDL.Int,
    'entry' : VaultEntry,
    'sharedWith' : IDL.Vec(IDL.Principal),
  });
  const Team = IDL.Record({
    'id' : IDL.Text,
    'members' : IDL.Vec(TeamMember),
    'owner' : IDL.Principal,
    'name' : IDL.Text,
    'createdAt' : IDL.Int,
  });
  const ApprovalStatus = IDL.Variant({
    'pending' : IDL.Null,
    'approved' : IDL.Null,
    'rejected' : IDL.Null,
  });
  const UserApprovalInfo = IDL.Record({
    'status' : ApprovalStatus,
    'principal' : IDL.Principal,
  });
  const HttpHeader = IDL.Record({ 'value' : IDL.Text, 'name' : IDL.Text });
  const HttpResponsePayload = IDL.Record({
    'status' : IDL.Nat,
    'body' : IDL.Vec(IDL.Nat8),
    'headers' : IDL.Vec(HttpHeader),
  });
  const TransformationInput = IDL.Record({
    'context' : IDL.Vec(IDL.Nat8),
    'response' : HttpResponsePayload,
  });
  const TransformationOutput = IDL.Record({
    'status' : IDL.Nat,
    'body' : IDL.Vec(IDL.Nat8),
    'headers' : IDL.Vec(HttpHeader),
  });
  return IDL.Service({
    'addFileReference' : IDL.Func([FileReference], [], []),
    'addPasskeyCredential' : IDL.Func([PasskeyCredential], [], []),
    'addRecommendation' : IDL.Func([SecurityRecommendation], [], []),
    'addTeamMember' : IDL.Func([IDL.Text, TeamMember], [], []),
    'addVaultEntry' : IDL.Func([VaultEntry], [], []),
    'assignCallerUserRole' : IDL.Func([IDL.Principal, UserRole], [], []),
    'createTeam' : IDL.Func([IDL.Text], [IDL.Text], []),
    'deletePasskeyCredential' : IDL.Func([IDL.Text], [], []),
    'deleteVaultEntry' : IDL.Func([IDL.Text], [], []),
    'generateInviteCode' : IDL.Func([], [IDL.Text], []),
    'getAIRecommendations' : IDL.Func([AIContext], [AIResponse], []),
    'getAllRSVPs' : IDL.Func([], [IDL.Vec(RSVP)], ['query']),
    'getCallerUserProfile' : IDL.Func([], [IDL.Opt(UserProfile)], ['query']),
    'getCallerUserRole' : IDL.Func([], [UserRole], ['query']),
    'getDashboardData' : IDL.Func([], [UserDashboardData], ['query']),
    'getFileReferences' : IDL.Func([], [IDL.Vec(FileReference)], ['query']),
    'getInviteCodes' : IDL.Func([], [IDL.Vec(InviteCode)], ['query']),
    'getPasskeyCount' : IDL.Func([], [IDL.Nat], ['query']),
    'getPasskeyCredentials' : IDL.Func(
        [],
        [IDL.Vec(PasskeyCredential)],
        ['query'],
      ),
    'getRecentActivity' : IDL.Func([], [IDL.Vec(ActivityLogEntry)], ['query']),
    'getRecommendations' : IDL.Func(
        [],
        [IDL.Vec(SecurityRecommendation)],
        ['query'],
      ),
    'getSharedVaultEntries' : IDL.Func(
        [],
        [IDL.Vec(SharedVaultEntry)],
        ['query'],
      ),
    'getTeams' : IDL.Func([], [IDL.Vec(Team)], ['query']),
    'getUserProfile' : IDL.Func(
        [IDL.Principal],
        [IDL.Opt(UserProfile)],
        ['query'],
      ),
    'getVaultEntries' : IDL.Func([], [IDL.Vec(VaultEntry)], ['query']),
    'initializeAccessControl' : IDL.Func([], [], []),
    'isCallerAdmin' : IDL.Func([], [IDL.Bool], ['query']),
    'isCallerApproved' : IDL.Func([], [IDL.Bool], ['query']),
    'listApprovals' : IDL.Func([], [IDL.Vec(UserApprovalInfo)], ['query']),
    'logActivity' : IDL.Func([IDL.Text, IDL.Text], [], []),
    'makeGetOutcall' : IDL.Func([IDL.Text], [IDL.Text], []),
    'requestApproval' : IDL.Func([], [], []),
    'saveCallerUserProfile' : IDL.Func([UserProfile], [], []),
    'setApproval' : IDL.Func([IDL.Principal, ApprovalStatus], [], []),
    'shareVaultEntry' : IDL.Func(
        [VaultEntry, IDL.Vec(IDL.Principal), IDL.Vec(IDL.Text)],
        [],
        [],
      ),
    'submitRSVP' : IDL.Func([IDL.Text, IDL.Bool, IDL.Text], [], []),
    'transform' : IDL.Func(
        [TransformationInput],
        [TransformationOutput],
        ['query'],
      ),
    'updateVaultEntry' : IDL.Func([VaultEntry], [], []),
  });
};
export const init = ({ IDL }) => { return []; };
