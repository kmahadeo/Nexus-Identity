import AccessControl "authorization/access-control";
import InviteLinksModule "invite-links/invite-links-module";
import UserApproval "user-approval/approval";
import OutCall "http-outcalls/outcall";
import Storage "blob-storage/Storage";
import MixinStorage "blob-storage/Mixin";
import Principal "mo:base/Principal";
import OrderedMap "mo:base/OrderedMap";
import Iter "mo:base/Iter";
import Array "mo:base/Array";
import Debug "mo:base/Debug";
import Time "mo:base/Time";
import Text "mo:base/Text";
import List "mo:base/List";
import Random "mo:base/Random";
import Nat "mo:base/Nat";

actor NexusIdentity {

  // ── Comparators (not stable — recreated on init) ──────────────────────────
  let principalMap = OrderedMap.Make<Principal>(Principal.compare);
  let textMap      = OrderedMap.Make<Text>(Text.compare);

  // ── Public types ──────────────────────────────────────────────────────────

  public type UserProfile = {
    name      : Text;
    email     : Text;
    tier      : Text; // "individual" | "smb" | "enterprise"
    createdAt : Int;
    lastLogin : Int;
  };

  public type VaultEntry = {
    id            : Text;
    name          : Text;
    category      : Text;
    encryptedData : Text; // AES-256-GCM encrypted client-side — canister never sees plaintext
    createdAt     : Int;
    updatedAt     : Int;
  };

  public type ActivityLogEntry = {
    timestamp : Int;
    action    : Text;
    details   : Text;
  };

  public type SecurityRecommendation = {
    id       : Text;
    message  : Text;
    priority : Nat;
  };

  public type UserDashboardData = {
    securityScore   : Nat;
    recentActivity  : [ActivityLogEntry];
    recommendations : [SecurityRecommendation];
  };

  public type TeamMember = {
    principal : Principal;
    role      : Text;
    addedAt   : Int;
  };

  public type Team = {
    id        : Text;
    name      : Text;
    owner     : Principal;
    members   : [TeamMember];
    createdAt : Int;
  };

  public type SharedVaultEntry = {
    entry       : VaultEntry;
    sharedWith  : [Principal];
    permissions : [Text];
    sharedAt    : Int;
  };

  public type PasskeyCredential = {
    credentialId  : Text;
    publicKeyHint : Text;
    deviceName    : Text;
    createdAt     : Int;
    lastUsed      : Int;
    transports    : [Text];
  };

  public type FileReference = {
    id         : Text;
    name       : Text;
    blob       : Storage.ExternalBlob;
    uploadedAt : Int;
  };

  public type AIContext = {
    vaultHealth : Text;
    authEvents  : Text;
    deviceData  : Text;
  };

  public type AIResponse = {
    advice    : Text;
    riskScore : Nat;
    confidence: Nat;
  };

  // ── Stable storage (survives canister upgrades) ───────────────────────────
  // We serialize OrderedMaps → flat arrays in preupgrade, reconstruct in postupgrade.

  stable var stableAdminAssigned  : Bool                                    = false;
  stable var stableUserRoles      : [(Principal, AccessControl.UserRole)]   = [];
  stable var stableApprovals      : [(Principal, UserApproval.ApprovalStatus)] = [];

  stable var stableUserProfiles   : [(Principal, UserProfile)]              = [];
  stable var stableUserVaults     : [(Principal, [(Text, VaultEntry)])]     = [];
  stable var stableActivityLogs   : [(Principal, [(Text, ActivityLogEntry)])] = [];
  stable var stableRecommendations: [(Principal, [(Text, SecurityRecommendation)])] = [];
  stable var stableTeams          : [(Text, Team)]                          = [];
  stable var stableShared         : [(Text, SharedVaultEntry)]              = [];
  stable var stablePasskeys       : [(Principal, [(Text, PasskeyCredential)])] = [];
  stable var stableFileRefs       : [(Text, FileReference)]                 = [];

  // ── Working memory (reconstructed from stable arrays on upgrade) ──────────

  let accessControlState = AccessControl.initState();
  let approvalState      = UserApproval.initState(accessControlState);

  var userProfiles    : OrderedMap.Map<Principal, UserProfile>                          = principalMap.empty();
  var userVaults      : OrderedMap.Map<Principal, OrderedMap.Map<Text, VaultEntry>>     = principalMap.empty();
  var activityLogs    : OrderedMap.Map<Principal, OrderedMap.Map<Text, ActivityLogEntry>> = principalMap.empty();
  var recommendations : OrderedMap.Map<Principal, OrderedMap.Map<Text, SecurityRecommendation>> = principalMap.empty();
  var teams           : OrderedMap.Map<Text, Team>                                      = textMap.empty();
  var sharedEntries   : OrderedMap.Map<Text, SharedVaultEntry>                          = textMap.empty();
  var userPasskeys    : OrderedMap.Map<Principal, OrderedMap.Map<Text, PasskeyCredential>> = principalMap.empty();
  var fileReferences  : OrderedMap.Map<Text, FileReference>                             = textMap.empty();

  // ── Helpers ───────────────────────────────────────────────────────────────

  func buildInnerTextMap<V>(entries : [(Text, V)]) : OrderedMap.Map<Text, V> {
    var m = textMap.empty<V>();
    for ((k, v) in entries.vals()) { m := textMap.put(m, k, v) };
    m
  };

  func serializeInnerTextMap<V>(m : OrderedMap.Map<Text, V>) : [(Text, V)] {
    Iter.toArray(textMap.entries(m))
  };

  // ── System upgrade hooks ──────────────────────────────────────────────────

  system func preupgrade() {
    // Access control
    stableAdminAssigned := accessControlState.adminAssigned;
    stableUserRoles     := Iter.toArray(
      OrderedMap.Make<Principal>(Principal.compare).entries(accessControlState.userRoles)
    );
    stableApprovals     := Iter.toArray(
      OrderedMap.Make<Principal>(Principal.compare).entries(approvalState.approvalStatus)
    );

    // User data
    stableUserProfiles    := Iter.toArray(principalMap.entries(userProfiles));
    stableTeams           := Iter.toArray(textMap.entries(teams));
    stableShared          := Iter.toArray(textMap.entries(sharedEntries));
    stableFileRefs        := Iter.toArray(textMap.entries(fileReferences));

    // Nested maps: (Principal → [(Text, V)])
    stableUserVaults := Array.map<(Principal, OrderedMap.Map<Text, VaultEntry>), (Principal, [(Text, VaultEntry)])>(
      Iter.toArray(principalMap.entries(userVaults)),
      func((p, m)) { (p, serializeInnerTextMap(m)) }
    );
    stableActivityLogs := Array.map<(Principal, OrderedMap.Map<Text, ActivityLogEntry>), (Principal, [(Text, ActivityLogEntry)])>(
      Iter.toArray(principalMap.entries(activityLogs)),
      func((p, m)) { (p, serializeInnerTextMap(m)) }
    );
    stableRecommendations := Array.map<(Principal, OrderedMap.Map<Text, SecurityRecommendation>), (Principal, [(Text, SecurityRecommendation)])>(
      Iter.toArray(principalMap.entries(recommendations)),
      func((p, m)) { (p, serializeInnerTextMap(m)) }
    );
    stablePasskeys := Array.map<(Principal, OrderedMap.Map<Text, PasskeyCredential>), (Principal, [(Text, PasskeyCredential)])>(
      Iter.toArray(principalMap.entries(userPasskeys)),
      func((p, m)) { (p, serializeInnerTextMap(m)) }
    );
  };

  system func postupgrade() {
    // Restore access control
    accessControlState.adminAssigned := stableAdminAssigned;
    for ((p, r) in stableUserRoles.vals()) {
      accessControlState.userRoles := principalMap.put(accessControlState.userRoles, p, r);
    };
    for ((p, s) in stableApprovals.vals()) {
      approvalState.approvalStatus := principalMap.put(approvalState.approvalStatus, p, s);
    };

    // Restore flat maps
    for ((p, prof) in stableUserProfiles.vals()) {
      userProfiles := principalMap.put(userProfiles, p, prof)
    };
    for ((k, t) in stableTeams.vals())    { teams          := textMap.put(teams, k, t) };
    for ((k, s) in stableShared.vals())   { sharedEntries  := textMap.put(sharedEntries, k, s) };
    for ((k, f) in stableFileRefs.vals()) { fileReferences := textMap.put(fileReferences, k, f) };

    // Restore nested maps
    for ((p, entries) in stableUserVaults.vals()) {
      userVaults := principalMap.put(userVaults, p, buildInnerTextMap(entries))
    };
    for ((p, entries) in stableActivityLogs.vals()) {
      activityLogs := principalMap.put(activityLogs, p, buildInnerTextMap(entries))
    };
    for ((p, entries) in stableRecommendations.vals()) {
      recommendations := principalMap.put(recommendations, p, buildInnerTextMap(entries))
    };
    for ((p, entries) in stablePasskeys.vals()) {
      userPasskeys := principalMap.put(userPasskeys, p, buildInnerTextMap(entries))
    };

    // Free stable arrays — data now lives in working memory
    stableUserProfiles    := [];
    stableUserVaults      := [];
    stableActivityLogs    := [];
    stableRecommendations := [];
    stableTeams           := [];
    stableShared          := [];
    stablePasskeys        := [];
    stableFileRefs        := [];
    stableUserRoles       := [];
    stableApprovals       := [];
  };

  // ── Access control ────────────────────────────────────────────────────────

  public shared ({ caller }) func initializeAccessControl() : async () {
    AccessControl.initialize(accessControlState, caller);
    // Auto-approve the first user (admin)
    if (accessControlState.adminAssigned) {
      UserApproval.setApproval(approvalState, caller, #approved);
    };
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

  // ── User profile ──────────────────────────────────────────────────────────

  public query ({ caller }) func getCallerUserProfile() : async ?UserProfile {
    principalMap.get(userProfiles, caller);
  };

  public query func getUserProfile(user : Principal) : async ?UserProfile {
    principalMap.get(userProfiles, user);
  };

  public shared ({ caller }) func saveCallerUserProfile(profile : UserProfile) : async () {
    userProfiles := principalMap.put(userProfiles, caller, profile);
    // Auto-register as user if not yet in access control
    let pm = OrderedMap.Make<Principal>(Principal.compare);
    switch (pm.get(accessControlState.userRoles, caller)) {
      case (null) {
        if (not accessControlState.adminAssigned) {
          accessControlState.userRoles    := pm.put(accessControlState.userRoles, caller, #admin);
          accessControlState.adminAssigned := true;
          UserApproval.setApproval(approvalState, caller, #approved);
        } else {
          accessControlState.userRoles := pm.put(accessControlState.userRoles, caller, #user);
          UserApproval.requestApproval(approvalState, caller);
        };
      };
      case (?_) {};
    };
  };

  // ── Vault ─────────────────────────────────────────────────────────────────

  public shared ({ caller }) func addVaultEntry(entry : VaultEntry) : async () {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Debug.trap("Unauthorized");
    };
    let vault = switch (principalMap.get(userVaults, caller)) {
      case (?v) v; case null textMap.empty<VaultEntry>();
    };
    userVaults := principalMap.put(userVaults, caller, textMap.put(vault, entry.id, entry));
  };

  public query ({ caller }) func getVaultEntries() : async [VaultEntry] {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Debug.trap("Unauthorized");
    };
    switch (principalMap.get(userVaults, caller)) {
      case (?v) Iter.toArray(textMap.vals(v));
      case null [];
    };
  };

  public shared ({ caller }) func deleteVaultEntry(entryId : Text) : async () {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Debug.trap("Unauthorized");
    };
    switch (principalMap.get(userVaults, caller)) {
      case (?v) {
        userVaults := principalMap.put(userVaults, caller, textMap.delete(v, entryId));
      };
      case null {};
    };
  };

  public shared ({ caller }) func updateVaultEntry(entry : VaultEntry) : async () {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Debug.trap("Unauthorized");
    };
    let vault = switch (principalMap.get(userVaults, caller)) {
      case (?v) v; case null textMap.empty<VaultEntry>();
    };
    userVaults := principalMap.put(userVaults, caller, textMap.put(vault, entry.id, entry));
  };

  // ── Activity log ──────────────────────────────────────────────────────────

  public shared ({ caller }) func logActivity(action : Text, details : Text) : async () {
    let entry : ActivityLogEntry = { timestamp = Time.now(); action; details };
    let logs = switch (principalMap.get(activityLogs, caller)) {
      case (?l) l; case null textMap.empty<ActivityLogEntry>();
    };
    let key = debug_show(Time.now()) # action; // unique key
    activityLogs := principalMap.put(activityLogs, caller, textMap.put(logs, key, entry));
  };

  public query ({ caller }) func getRecentActivity() : async [ActivityLogEntry] {
    switch (principalMap.get(activityLogs, caller)) {
      case (?logs) {
        let all = Iter.toArray(textMap.vals(logs));
        List.toArray(List.take(List.fromArray(all), 10));
      };
      case null [];
    };
  };

  // ── Security recommendations ──────────────────────────────────────────────

  public shared ({ caller }) func addRecommendation(rec : SecurityRecommendation) : async () {
    let recs = switch (principalMap.get(recommendations, caller)) {
      case (?r) r; case null textMap.empty<SecurityRecommendation>();
    };
    recommendations := principalMap.put(recommendations, caller, textMap.put(recs, rec.id, rec));
  };

  public query ({ caller }) func getRecommendations() : async [SecurityRecommendation] {
    switch (principalMap.get(recommendations, caller)) {
      case (?r) Iter.toArray(textMap.vals(r));
      case null [];
    };
  };

  // ── Dashboard ─────────────────────────────────────────────────────────────

  public query ({ caller }) func getDashboardData() : async UserDashboardData {
    let vaultCount = switch (principalMap.get(userVaults, caller)) {
      case (?v) textMap.size(v); case null 0;
    };
    let recCount = switch (principalMap.get(recommendations, caller)) {
      case (?r) textMap.size(r); case null 0;
    };
    let bonus   = if (vaultCount > 8) 40 else vaultCount * 5;
    let penalty = if (recCount   > 8) 40 else recCount   * 5;
    let raw     = 40 + bonus;
    let score   = if (raw > penalty) raw - penalty else 0;

    let recentActivity = switch (principalMap.get(activityLogs, caller)) {
      case (?l) List.toArray(List.take(List.fromArray(Iter.toArray(textMap.vals(l))), 5));
      case null [];
    };
    let recs = switch (principalMap.get(recommendations, caller)) {
      case (?r) Iter.toArray(textMap.vals(r)); case null [];
    };
    { securityScore = score; recentActivity; recommendations = recs };
  };

  // ── Teams ─────────────────────────────────────────────────────────────────

  public shared ({ caller }) func createTeam(name : Text) : async Text {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Debug.trap("Unauthorized");
    };
    let teamId = debug_show(Time.now());
    let team : Team = {
      id = teamId; name; owner = caller;
      members = [{ principal = caller; role = "owner"; addedAt = Time.now() }];
      createdAt = Time.now();
    };
    teams := textMap.put(teams, teamId, team);
    teamId
  };

  public query ({ caller }) func getTeams() : async [Team] {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Debug.trap("Unauthorized");
    };
    let all = Iter.toArray(textMap.vals(teams));
    List.toArray(List.filter(List.fromArray(all), func(t : Team) : Bool {
      List.some(List.fromArray(t.members), func(m : TeamMember) : Bool { m.principal == caller })
    }))
  };

  public shared ({ caller }) func addTeamMember(teamId : Text, member : TeamMember) : async () {
    switch (textMap.get(teams, teamId)) {
      case (?team) {
        if (team.owner != caller) Debug.trap("Unauthorized: Only team owner can add members");
        let updated = { team with members = List.toArray(List.push(member, List.fromArray(team.members))) };
        teams := textMap.put(teams, teamId, updated);
      };
      case null Debug.trap("Team not found");
    };
  };

  // ── Shared vault entries ──────────────────────────────────────────────────

  public shared ({ caller }) func shareVaultEntry(entry : VaultEntry, sharedWith : [Principal], permissions : [Text]) : async () {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Debug.trap("Unauthorized");
    };
    let sharedEntry : SharedVaultEntry = { entry; sharedWith; permissions; sharedAt = Time.now() };
    sharedEntries := textMap.put(sharedEntries, entry.id, sharedEntry);
  };

  public query ({ caller }) func getSharedVaultEntries() : async [SharedVaultEntry] {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Debug.trap("Unauthorized");
    };
    let all = Iter.toArray(textMap.vals(sharedEntries));
    List.toArray(List.filter(List.fromArray(all), func(e : SharedVaultEntry) : Bool {
      List.some(List.fromArray(e.sharedWith), func(p : Principal) : Bool { p == caller })
    }))
  };

  // ── Passkeys ──────────────────────────────────────────────────────────────

  public shared ({ caller }) func addPasskeyCredential(cred : PasskeyCredential) : async () {
    let passkeys = switch (principalMap.get(userPasskeys, caller)) {
      case (?p) p; case null textMap.empty<PasskeyCredential>();
    };
    userPasskeys := principalMap.put(userPasskeys, caller, textMap.put(passkeys, cred.credentialId, cred));
  };

  public query ({ caller }) func getPasskeyCredentials() : async [PasskeyCredential] {
    switch (principalMap.get(userPasskeys, caller)) {
      case (?p) Iter.toArray(textMap.vals(p));
      case null [];
    };
  };

  public shared ({ caller }) func deletePasskeyCredential(credentialId : Text) : async () {
    switch (principalMap.get(userPasskeys, caller)) {
      case (?p) {
        userPasskeys := principalMap.put(userPasskeys, caller, textMap.delete(p, credentialId));
      };
      case null {};
    };
  };

  public query ({ caller }) func getPasskeyCount() : async Nat {
    switch (principalMap.get(userPasskeys, caller)) {
      case (?p) textMap.size(p); case null 0;
    };
  };

  // ── Invite links ──────────────────────────────────────────────────────────

  let inviteState = InviteLinksModule.initState();

  public shared ({ caller }) func generateInviteCode() : async Text {
    if (not (AccessControl.hasPermission(accessControlState, caller, #admin))) {
      Debug.trap("Unauthorized");
    };
    let blob = await Random.blob();
    let code = InviteLinksModule.generateUUID(blob);
    InviteLinksModule.generateInviteCode(inviteState, code);
    code
  };

  public func submitRSVP(name : Text, attending : Bool, inviteCode : Text) : async () {
    InviteLinksModule.submitRSVP(inviteState, name, attending, inviteCode);
  };

  public query ({ caller }) func getAllRSVPs() : async [InviteLinksModule.RSVP] {
    if (not (AccessControl.hasPermission(accessControlState, caller, #admin))) {
      Debug.trap("Unauthorized");
    };
    InviteLinksModule.getAllRSVPs(inviteState)
  };

  public query ({ caller }) func getInviteCodes() : async [InviteLinksModule.InviteCode] {
    if (not (AccessControl.hasPermission(accessControlState, caller, #admin))) {
      Debug.trap("Unauthorized");
    };
    InviteLinksModule.getInviteCodes(inviteState)
  };

  // ── User approval ─────────────────────────────────────────────────────────

  public query ({ caller }) func isCallerApproved() : async Bool {
    AccessControl.hasPermission(accessControlState, caller, #admin) or
    UserApproval.isApproved(approvalState, caller)
  };

  public shared ({ caller }) func requestApproval() : async () {
    UserApproval.requestApproval(approvalState, caller);
  };

  public shared ({ caller }) func setApproval(user : Principal, status : UserApproval.ApprovalStatus) : async () {
    if (not (AccessControl.hasPermission(accessControlState, caller, #admin))) {
      Debug.trap("Unauthorized");
    };
    UserApproval.setApproval(approvalState, user, status);
  };

  public query ({ caller }) func listApprovals() : async [UserApproval.UserApprovalInfo] {
    if (not (AccessControl.hasPermission(accessControlState, caller, #admin))) {
      Debug.trap("Unauthorized");
    };
    UserApproval.listApprovals(approvalState)
  };

  // ── HTTP outcalls ─────────────────────────────────────────────────────────

  public query func transform(input : OutCall.TransformationInput) : async OutCall.TransformationOutput {
    OutCall.transform(input)
  };

  public shared func makeGetOutcall(url : Text) : async Text {
    await OutCall.httpGetRequest(url, [], transform)
  };

  // ── Blob / file storage ───────────────────────────────────────────────────

  let storage = Storage.new();
  ignore MixinStorage.init(storage);

  public shared ({ caller }) func addFileReference(file : FileReference) : async () {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Debug.trap("Unauthorized");
    };
    fileReferences := textMap.put(fileReferences, file.id, file);
  };

  public query ({ caller }) func getFileReferences() : async [FileReference] {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Debug.trap("Unauthorized");
    };
    Iter.toArray(textMap.vals(fileReferences))
  };

  // ── AI recommendations ────────────────────────────────────────────────────

  public shared func getAIRecommendations(context : AIContext) : async AIResponse {
    let url     = "https://api.chatanywhere.tech/v1/chat/completions";
    let payload = "{ \"model\": \"gpt-4o-ca\", \"context\": \""
      # context.vaultHealth # context.authEvents # context.deviceData # "\" }";
    let response = await OutCall.httpPostRequest(url, [], payload, transform);
    { advice = response; riskScore = 80; confidence = 90 }
  };
};
