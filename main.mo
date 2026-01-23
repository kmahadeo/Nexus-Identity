import AccessControl "authorization/access-control";
import InviteLinksModule "invite-links/invite-links-module";
import UserApproval "user-approval/approval";
import OutCall "http-outcalls/outcall";
import Storage "blob-storage/Storage";
import MixinStorage "blob-storage/Mixin";
import Principal "mo:base/Principal";
import OrderedMap "mo:base/OrderedMap";
import Iter "mo:base/Iter";
import Debug "mo:base/Debug";
import Time "mo:base/Time";
import Text "mo:base/Text";
import List "mo:base/List";
import Random "mo:base/Random";
import Nat "mo:base/Nat";

actor NexusIdentity {
  // Initialize the access control state
  let accessControlState = AccessControl.initState();

  // Initialize the user approval state
  let approvalState = UserApproval.initState(accessControlState);

  // Initialize access control (first caller becomes admin, others become users)
  public shared ({ caller }) func initializeAccessControl() : async () {
    AccessControl.initialize(accessControlState, caller);
  };

  public query ({ caller }) func getCallerUserRole() : async AccessControl.UserRole {
    AccessControl.getUserRole(accessControlState, caller);
  };

  public shared ({ caller }) func assignCallerUserRole(user : Principal, role : AccessControl.UserRole) : async () {
    AccessControl.assignRole(accessControlState, caller, user, role);
  };

  public query ({ caller }) func isCallerAdmin() : async Bool {
    AccessControl.isAdmin(accessControlState, caller);
  };

  // User profile type
  public type UserProfile = {
    name : Text;
    email : Text;
    createdAt : Int;
    lastLogin : Int;
  };

  // Vault entry type
  public type VaultEntry = {
    id : Text;
    name : Text;
    category : Text;
    encryptedData : Text;
    createdAt : Int;
    updatedAt : Int;
  };

  // Activity log entry type
  public type ActivityLogEntry = {
    timestamp : Int;
    action : Text;
    details : Text;
  };

  // Security recommendation type
  public type SecurityRecommendation = {
    id : Text;
    message : Text;
    priority : Nat;
  };

  // User dashboard data type
  public type UserDashboardData = {
    securityScore : Nat;
    recentActivity : [ActivityLogEntry];
    recommendations : [SecurityRecommendation];
  };

  // Team member type
  public type TeamMember = {
    principal : Principal;
    role : Text;
    addedAt : Int;
  };

  // Team type
  public type Team = {
    id : Text;
    name : Text;
    owner : Principal;
    members : [TeamMember];
    createdAt : Int;
  };

  // Shared vault entry type
  public type SharedVaultEntry = {
    entry : VaultEntry;
    sharedWith : [Principal];
    permissions : [Text];
    sharedAt : Int;
  };

  // OrderedMap operations
  transient let principalMap = OrderedMap.Make<Principal>(Principal.compare);
  transient let textMap = OrderedMap.Make<Text>(Text.compare);

  // Storage variables
  var userProfiles = principalMap.empty<UserProfile>();
  var userVaults = principalMap.empty<OrderedMap.Map<Text, VaultEntry>>();
  var userActivityLogs = principalMap.empty<OrderedMap.Map<Text, ActivityLogEntry>>();
  var userRecommendations = principalMap.empty<OrderedMap.Map<Text, SecurityRecommendation>>();
  var teams = textMap.empty<Team>();
  var sharedVaultEntries = textMap.empty<SharedVaultEntry>();
  var fileReferences = textMap.empty<FileReference>();

  // User profile functions
  public query ({ caller }) func getCallerUserProfile() : async ?UserProfile {
    principalMap.get(userProfiles, caller);
  };

  public query func getUserProfile(user : Principal) : async ?UserProfile {
    principalMap.get(userProfiles, user);
  };

  public shared ({ caller }) func saveCallerUserProfile(profile : UserProfile) : async () {
    userProfiles := principalMap.put(userProfiles, caller, profile);
  };

  // Vault functions
  public shared ({ caller }) func addVaultEntry(entry : VaultEntry) : async () {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Debug.trap("Unauthorized: Only users can add vault entries");
    };

    let currentVault = switch (principalMap.get(userVaults, caller)) {
      case (?vault) { vault };
      case null { textMap.empty<VaultEntry>() };
    };

    let updatedVault = textMap.put(currentVault, entry.id, entry);
    userVaults := principalMap.put(userVaults, caller, updatedVault);
  };

  public query ({ caller }) func getVaultEntries() : async [VaultEntry] {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Debug.trap("Unauthorized: Only users can access vault entries");
    };

    switch (principalMap.get(userVaults, caller)) {
      case (?vault) {
        Iter.toArray(textMap.vals(vault));
      };
      case null { [] };
    };
  };

  public shared ({ caller }) func deleteVaultEntry(entryId : Text) : async () {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Debug.trap("Unauthorized: Only users can delete vault entries");
    };

    let currentVault = switch (principalMap.get(userVaults, caller)) {
      case (?vault) { vault };
      case null { textMap.empty<VaultEntry>() };
    };

    let updatedVault = textMap.delete(currentVault, entryId);
    userVaults := principalMap.put(userVaults, caller, updatedVault);
  };

  // Activity log functions
  public shared ({ caller }) func logActivity(action : Text, details : Text) : async () {
    let logEntry : ActivityLogEntry = {
      timestamp = Time.now();
      action;
      details;
    };

    let currentLogs = switch (principalMap.get(userActivityLogs, caller)) {
      case (?logs) { logs };
      case null { textMap.empty<ActivityLogEntry>() };
    };

    let updatedLogs = textMap.put(currentLogs, debug_show (Time.now()), logEntry);
    userActivityLogs := principalMap.put(userActivityLogs, caller, updatedLogs);
  };

  public query ({ caller }) func getRecentActivity() : async [ActivityLogEntry] {
    switch (principalMap.get(userActivityLogs, caller)) {
      case (?logs) {
        let allEntries = Iter.toArray(textMap.vals(logs));
        let recentEntries = List.take(
          List.fromArray(allEntries),
          10,
        );
        List.toArray(recentEntries);
      };
      case null { [] };
    };
  };

  // Security recommendations functions
  public shared ({ caller }) func addRecommendation(recommendation : SecurityRecommendation) : async () {
    let currentRecs = switch (principalMap.get(userRecommendations, caller)) {
      case (?recs) { recs };
      case null { textMap.empty<SecurityRecommendation>() };
    };

    let updatedRecs = textMap.put(currentRecs, recommendation.id, recommendation);
    userRecommendations := principalMap.put(userRecommendations, caller, updatedRecs);
  };

  public query ({ caller }) func getRecommendations() : async [SecurityRecommendation] {
    switch (principalMap.get(userRecommendations, caller)) {
      case (?recs) {
        Iter.toArray(textMap.vals(recs));
      };
      case null { [] };
    };
  };

  // Dashboard data function
  public query ({ caller }) func getDashboardData() : async UserDashboardData {
    let securityScore = 80; // Placeholder score

    let recentActivity = switch (principalMap.get(userActivityLogs, caller)) {
      case (?logs) {
        let allEntries = Iter.toArray(textMap.vals(logs));
        let recentEntries = List.take(
          List.fromArray(allEntries),
          5,
        );
        List.toArray(recentEntries);
      };
      case null { [] };
    };

    let recommendations = switch (principalMap.get(userRecommendations, caller)) {
      case (?recs) {
        Iter.toArray(textMap.vals(recs));
      };
      case null { [] };
    };

    {
      securityScore;
      recentActivity;
      recommendations;
    };
  };

  // Team functions
  public shared ({ caller }) func createTeam(name : Text) : async Text {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Debug.trap("Unauthorized: Only users can create teams");
    };

    let teamId = debug_show (Time.now());
    let newTeam : Team = {
      id = teamId;
      name;
      owner = caller;
      members = [{
        principal = caller;
        role = "owner";
        addedAt = Time.now();
      }];
      createdAt = Time.now();
    };

    teams := textMap.put(teams, teamId, newTeam);
    teamId;
  };

  public query ({ caller }) func getTeams() : async [Team] {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Debug.trap("Unauthorized: Only users can access teams");
    };

    let allTeams = Iter.toArray(textMap.vals(teams));
    let userTeams = List.filter(
      List.fromArray(allTeams),
      func(team : Team) : Bool {
        List.some(
          List.fromArray(team.members),
          func(member : TeamMember) : Bool {
            member.principal == caller;
          },
        );
      },
    );
    List.toArray(userTeams);
  };

  public shared ({ caller }) func addTeamMember(teamId : Text, member : TeamMember) : async () {
    switch (textMap.get(teams, teamId)) {
      case (?team) {
        if (team.owner != caller) {
          Debug.trap("Unauthorized: Only team owners can add members");
        };

        let updatedMembers = List.toArray(
          List.push(member, List.fromArray(team.members))
        );

        let updatedTeam = {
          team with
          members = updatedMembers;
        };

        teams := textMap.put(teams, teamId, updatedTeam);
      };
      case null {
        Debug.trap("Team not found");
      };
    };
  };

  // Shared vault entry functions
  public shared ({ caller }) func shareVaultEntry(entry : VaultEntry, sharedWith : [Principal], permissions : [Text]) : async () {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Debug.trap("Unauthorized: Only users can share vault entries");
    };

    let sharedEntry : SharedVaultEntry = {
      entry;
      sharedWith;
      permissions;
      sharedAt = Time.now();
    };

    sharedVaultEntries := textMap.put(sharedVaultEntries, entry.id, sharedEntry);
  };

  public query ({ caller }) func getSharedVaultEntries() : async [SharedVaultEntry] {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Debug.trap("Unauthorized: Only users can access shared vault entries");
    };

    let allEntries = Iter.toArray(textMap.vals(sharedVaultEntries));
    let userEntries = List.filter(
      List.fromArray(allEntries),
      func(entry : SharedVaultEntry) : Bool {
        List.some(
          List.fromArray(entry.sharedWith),
          func(p : Principal) : Bool {
            p == caller;
          },
        );
      },
    );
    List.toArray(userEntries);
  };

  // Invite links system
  let inviteState = InviteLinksModule.initState();

  // Generate invite code (admin only)
  public shared ({ caller }) func generateInviteCode() : async Text {
    if (not (AccessControl.hasPermission(accessControlState, caller, #admin))) {
      Debug.trap("Unauthorized: Only admins can generate invite codes");
    };
    let blob = await Random.blob();
    let code = InviteLinksModule.generateUUID(blob);
    InviteLinksModule.generateInviteCode(inviteState, code);
    code;
  };

  // Submit RSVP (public, but requires valid invite code)
  public func submitRSVP(name : Text, attending : Bool, inviteCode : Text) : async () {
    InviteLinksModule.submitRSVP(inviteState, name, attending, inviteCode);
  };

  // Get all RSVPs (admin only)
  public query ({ caller }) func getAllRSVPs() : async [InviteLinksModule.RSVP] {
    if (not (AccessControl.hasPermission(accessControlState, caller, #admin))) {
      Debug.trap("Unauthorized: Only admins can view RSVPs");
    };
    InviteLinksModule.getAllRSVPs(inviteState);
  };

  // Get all invite codes (admin only)
  public query ({ caller }) func getInviteCodes() : async [InviteLinksModule.InviteCode] {
    if (not (AccessControl.hasPermission(accessControlState, caller, #admin))) {
      Debug.trap("Unauthorized: Only admins can view invite codes");
    };
    InviteLinksModule.getInviteCodes(inviteState);
  };

  // User approval functions
  public query ({ caller }) func isCallerApproved() : async Bool {
    AccessControl.hasPermission(accessControlState, caller, #admin) or UserApproval.isApproved(approvalState, caller);
  };

  public shared ({ caller }) func requestApproval() : async () {
    UserApproval.requestApproval(approvalState, caller);
  };

  public shared ({ caller }) func setApproval(user : Principal, status : UserApproval.ApprovalStatus) : async () {
    if (not (AccessControl.hasPermission(accessControlState, caller, #admin))) {
      Debug.trap("Unauthorized: Only admins can perform this action");
    };
    UserApproval.setApproval(approvalState, user, status);
  };

  public query ({ caller }) func listApprovals() : async [UserApproval.UserApprovalInfo] {
    if (not (AccessControl.hasPermission(accessControlState, caller, #admin))) {
      Debug.trap("Unauthorized: Only admins can perform this action");
    };
    UserApproval.listApprovals(approvalState);
  };

  // HTTP outcall transformation function
  public query func transform(input : OutCall.TransformationInput) : async OutCall.TransformationOutput {
    OutCall.transform(input);
  };

  // HTTP GET outcall function
  public shared func makeGetOutcall(url : Text) : async Text {
    await OutCall.httpGetRequest(url, [], transform);
  };

  // Blob storage integration
  let storage = Storage.new();
  include MixinStorage(storage);

  // File reference type
  public type FileReference = {
    id : Text;
    name : Text;
    blob : Storage.ExternalBlob;
    uploadedAt : Int;
  };

  // Add file reference
  public shared ({ caller }) func addFileReference(file : FileReference) : async () {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Debug.trap("Unauthorized: Only users can add files");
    };
    fileReferences := textMap.put(fileReferences, file.id, file);
  };

  // Get file references
  public query ({ caller }) func getFileReferences() : async [FileReference] {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Debug.trap("Unauthorized: Only users can access files");
    };
    Iter.toArray(textMap.vals(fileReferences));
  };

  // AIClient integration
  public type AIContext = {
    vaultHealth : Text;
    authEvents : Text;
    deviceData : Text;
  };

  public type AIResponse = {
    advice : Text;
    riskScore : Nat;
    confidence : Nat;
  };

  public shared func getAIRecommendations(context : AIContext) : async AIResponse {
    let url = "https://api.chatanywhere.tech/v1/chat/completions";
    let payload = "{ \"model\": \"gpt-4o-ca\", \"context\": " # context.vaultHealth # context.authEvents # context.deviceData # " }";

    let response = await OutCall.httpPostRequest(url, [], payload, transform);

    // Parse the response (assuming JSON format)
    // In a real implementation, you would parse the JSON response properly
    // Here we just return a placeholder response
    {
      advice = response;
      riskScore = 80;
      confidence = 90;
    };
  };
};

