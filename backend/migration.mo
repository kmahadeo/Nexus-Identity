import OrderedMap "mo:base/OrderedMap";
import Principal "mo:base/Principal";
import Text "mo:base/Text";

module {
  type OldActor = {
    userProfiles : OrderedMap.Map<Principal, {
      name : Text;
      email : Text;
      createdAt : Int;
      lastLogin : Int;
    }>;
    userVaults : OrderedMap.Map<Principal, OrderedMap.Map<Text, {
      id : Text;
      name : Text;
      category : Text;
      encryptedData : Text;
      createdAt : Int;
      updatedAt : Int;
    }>>;
    userActivityLogs : OrderedMap.Map<Principal, OrderedMap.Map<Text, {
      timestamp : Int;
      action : Text;
      details : Text;
    }>>;
    userRecommendations : OrderedMap.Map<Principal, OrderedMap.Map<Text, {
      id : Text;
      message : Text;
      priority : Nat;
    }>>;
    teams : OrderedMap.Map<Text, {
      id : Text;
      name : Text;
      owner : Principal;
      members : [{
        principal : Principal;
        role : Text;
        addedAt : Int;
      }];
      createdAt : Int;
    }>;
    sharedVaultEntries : OrderedMap.Map<Text, {
      entry : {
        id : Text;
        name : Text;
        category : Text;
        encryptedData : Text;
        createdAt : Int;
        updatedAt : Int;
      };
      sharedWith : [Principal];
      permissions : [Text];
      sharedAt : Int;
    }>;
    fileReferences : OrderedMap.Map<Text, {
      id : Text;
      name : Text;
      blob : {
        id : Text;
        url : Text;
        size : Nat;
        contentType : Text;
      };
      uploadedAt : Int;
    }>;
  };

  type NewActor = {
    userProfiles : OrderedMap.Map<Principal, {
      name : Text;
      email : Text;
      createdAt : Int;
      lastLogin : Int;
    }>;
    userVaults : OrderedMap.Map<Principal, OrderedMap.Map<Text, {
      id : Text;
      name : Text;
      category : Text;
      encryptedData : Text;
      createdAt : Int;
      updatedAt : Int;
    }>>;
    userActivityLogs : OrderedMap.Map<Principal, OrderedMap.Map<Text, {
      timestamp : Int;
      action : Text;
      details : Text;
    }>>;
    userRecommendations : OrderedMap.Map<Principal, OrderedMap.Map<Text, {
      id : Text;
      message : Text;
      priority : Nat;
    }>>;
    teams : OrderedMap.Map<Text, {
      id : Text;
      name : Text;
      owner : Principal;
      members : [{
        principal : Principal;
        role : Text;
        addedAt : Int;
      }];
      createdAt : Int;
    }>;
    sharedVaultEntries : OrderedMap.Map<Text, {
      entry : {
        id : Text;
        name : Text;
        category : Text;
        encryptedData : Text;
        createdAt : Int;
        updatedAt : Int;
      };
      sharedWith : [Principal];
      permissions : [Text];
      sharedAt : Int;
    }>;
    fileReferences : OrderedMap.Map<Text, {
      id : Text;
      name : Text;
      blob : {
        id : Text;
        url : Text;
        size : Nat;
        contentType : Text;
      };
      uploadedAt : Int;
    }>;
  };

  public func run(old : OldActor) : NewActor {
    old;
  };
};
