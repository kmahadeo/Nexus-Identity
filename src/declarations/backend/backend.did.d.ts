import type { Principal } from '@dfinity/principal';
import type { ActorMethod } from '@dfinity/agent';
import type { IDL } from '@dfinity/candid';

export interface AIContext {
  'deviceData' : string,
  'vaultHealth' : string,
  'authEvents' : string,
}
export interface AIResponse {
  'advice' : string,
  'confidence' : bigint,
  'riskScore' : bigint,
}
export interface ActivityLogEntry {
  'action' : string,
  'timestamp' : bigint,
  'details' : string,
}
export type ApprovalStatus = { 'pending' : null } |
  { 'approved' : null } |
  { 'rejected' : null };
export interface ExternalBlob {
  'id' : string,
  'url' : string,
  'contentType' : string,
  'size' : bigint,
}
export interface FileReference {
  'id' : string,
  'blob' : ExternalBlob,
  'name' : string,
  'uploadedAt' : bigint,
}
export interface HttpHeader { 'value' : string, 'name' : string }
export interface HttpResponsePayload {
  'status' : bigint,
  'body' : Uint8Array | number[],
  'headers' : Array<HttpHeader>,
}
export interface InviteCode {
  'created' : Time,
  'code' : string,
  'used' : boolean,
}
export interface PasskeyCredential {
  'publicKeyHint' : string,
  'createdAt' : bigint,
  'transports' : Array<string>,
  'credentialId' : string,
  'deviceName' : string,
  'lastUsed' : bigint,
}
export interface RSVP {
  'name' : string,
  'inviteCode' : string,
  'timestamp' : Time,
  'attending' : boolean,
}
export interface SecurityRecommendation {
  'id' : string,
  'message' : string,
  'priority' : bigint,
}
export interface SharedVaultEntry {
  'permissions' : Array<string>,
  'sharedAt' : bigint,
  'entry' : VaultEntry,
  'sharedWith' : Array<Principal>,
}
export interface Team {
  'id' : string,
  'members' : Array<TeamMember>,
  'owner' : Principal,
  'name' : string,
  'createdAt' : bigint,
}
export interface TeamMember {
  'principal' : Principal,
  'role' : string,
  'addedAt' : bigint,
}
export type Time = bigint;
export interface TransformationInput {
  'context' : Uint8Array | number[],
  'response' : HttpResponsePayload,
}
export interface TransformationOutput {
  'status' : bigint,
  'body' : Uint8Array | number[],
  'headers' : Array<HttpHeader>,
}
export interface UserApprovalInfo {
  'status' : ApprovalStatus,
  'principal' : Principal,
}
export interface UserDashboardData {
  'recommendations' : Array<SecurityRecommendation>,
  'recentActivity' : Array<ActivityLogEntry>,
  'securityScore' : bigint,
}
export interface UserProfile {
  'name' : string,
  'createdAt' : bigint,
  'tier' : string,
  'email' : string,
  'lastLogin' : bigint,
}
export type UserRole = { 'admin' : null } |
  { 'user' : null } |
  { 'guest' : null };
export interface VaultEntry {
  'id' : string,
  'name' : string,
  'createdAt' : bigint,
  'updatedAt' : bigint,
  'category' : string,
  'encryptedData' : string,
}
export interface _SERVICE {
  'addFileReference' : ActorMethod<[FileReference], undefined>,
  'addPasskeyCredential' : ActorMethod<[PasskeyCredential], undefined>,
  'addRecommendation' : ActorMethod<[SecurityRecommendation], undefined>,
  'addTeamMember' : ActorMethod<[string, TeamMember], undefined>,
  'addVaultEntry' : ActorMethod<[VaultEntry], undefined>,
  'assignCallerUserRole' : ActorMethod<[Principal, UserRole], undefined>,
  'createTeam' : ActorMethod<[string], string>,
  'deletePasskeyCredential' : ActorMethod<[string], undefined>,
  'deleteVaultEntry' : ActorMethod<[string], undefined>,
  'generateInviteCode' : ActorMethod<[], string>,
  'getAIRecommendations' : ActorMethod<[AIContext], AIResponse>,
  'getAllRSVPs' : ActorMethod<[], Array<RSVP>>,
  'getCallerUserProfile' : ActorMethod<[], [] | [UserProfile]>,
  'getCallerUserRole' : ActorMethod<[], UserRole>,
  'getDashboardData' : ActorMethod<[], UserDashboardData>,
  'getFileReferences' : ActorMethod<[], Array<FileReference>>,
  'getInviteCodes' : ActorMethod<[], Array<InviteCode>>,
  'getPasskeyCount' : ActorMethod<[], bigint>,
  'getPasskeyCredentials' : ActorMethod<[], Array<PasskeyCredential>>,
  'getRecentActivity' : ActorMethod<[], Array<ActivityLogEntry>>,
  'getRecommendations' : ActorMethod<[], Array<SecurityRecommendation>>,
  'getSharedVaultEntries' : ActorMethod<[], Array<SharedVaultEntry>>,
  'getTeams' : ActorMethod<[], Array<Team>>,
  'getUserProfile' : ActorMethod<[Principal], [] | [UserProfile]>,
  'getVaultEntries' : ActorMethod<[], Array<VaultEntry>>,
  'initializeAccessControl' : ActorMethod<[], undefined>,
  'isCallerAdmin' : ActorMethod<[], boolean>,
  'isCallerApproved' : ActorMethod<[], boolean>,
  'listApprovals' : ActorMethod<[], Array<UserApprovalInfo>>,
  'logActivity' : ActorMethod<[string, string], undefined>,
  'makeGetOutcall' : ActorMethod<[string], string>,
  'requestApproval' : ActorMethod<[], undefined>,
  'saveCallerUserProfile' : ActorMethod<[UserProfile], undefined>,
  'setApproval' : ActorMethod<[Principal, ApprovalStatus], undefined>,
  'shareVaultEntry' : ActorMethod<
    [VaultEntry, Array<Principal>, Array<string>],
    undefined
  >,
  'submitRSVP' : ActorMethod<[string, boolean, string], undefined>,
  'transform' : ActorMethod<[TransformationInput], TransformationOutput>,
  'updateVaultEntry' : ActorMethod<[VaultEntry], undefined>,
}
export declare const idlFactory: IDL.InterfaceFactory;
export declare const init: (args: { IDL: typeof IDL }) => IDL.Type[];
