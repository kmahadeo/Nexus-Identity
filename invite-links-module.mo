import Map "mo:base/OrderedMap";
import Debug "mo:base/Debug";
import Time "mo:base/Time";
import Text "mo:base/Text";
import Iter "mo:base/Iter";
import Blob "mo:base/Blob";
import Nat8 "mo:base/Nat8";

module {
    public type InviteLinksSystemState = {
        var rsvps : Map.Map<Text, RSVP>;
        var inviteCodes : Map.Map<Text, InviteCode>;
    };
    
    public func initState() : InviteLinksSystemState {
        let rsvpMap = Map.Make<Text>(Text.compare);
        let inviteMap = Map.Make<Text>(Text.compare);
        {
            var rsvps = rsvpMap.empty<RSVP>();
            var inviteCodes = inviteMap.empty<InviteCode>();
        }
    };
    
    // ** RSVP **
    public type RSVP = {
        name : Text;
        attending : Bool;
        timestamp : Time.Time;
        inviteCode : Text;
    };

    public type InviteCode = {
        code : Text;
        created : Time.Time;
        used : Bool;
    };

    private func blobToUUID(blob : Blob) : Text {
        let bytes = Blob.toArray(blob);
        let hex = func(n : Nat8) : Text {
            let digits = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'a', 'b', 'c', 'd', 'e', 'f'];
            Text.fromChar(digits[Nat8.toNat(n / 16)]) # Text.fromChar(digits[Nat8.toNat(n % 16)]);
        };
        var uuid = "";
        for (i in bytes.keys()) {
            if (i == 4 or i == 6 or i == 8 or i == 10) uuid #= "-";
            if (i < 16) uuid #= hex(bytes[i]);
        };
        uuid;
    };

    public func generateUUID(blob: Blob) : Text {
        blobToUUID(blob);
    };

    public func generateInviteCode(state: InviteLinksSystemState, code: Text) {
        let invite : InviteCode = {
            code = code;
            created = Time.now();
            used = false;
        };
        let inviteMap = Map.Make<Text>(Text.compare);
        state.inviteCodes := inviteMap.put(state.inviteCodes, code, invite);
    };

    public func submitRSVP(state: InviteLinksSystemState, name : Text, attending : Bool, inviteCode : Text) {
        let inviteMap = Map.Make<Text>(Text.compare);
        let rsvpMap = Map.Make<Text>(Text.compare);
        
        switch (inviteMap.get(state.inviteCodes, inviteCode)) {
            case null {
                Debug.trap("Invalid invite code");
            };
            case (?invite) {
                if (invite.used) {
                    Debug.trap("Invite code already used");
                };

                let rsvp : RSVP = {
                    name = name;
                    attending = attending;
                    timestamp = Time.now();
                    inviteCode = inviteCode;
                };
                
                let updatedInvite : InviteCode = {
                    invite with used = true
                };
                
                state.rsvps := rsvpMap.put(state.rsvps, name, rsvp);
                state.inviteCodes := inviteMap.put(state.inviteCodes, inviteCode, updatedInvite);
            };
        };
    };

    public func getAllRSVPs(state: InviteLinksSystemState) : [RSVP] {
        let rsvpMap = Map.Make<Text>(Text.compare);
        Iter.toArray(rsvpMap.vals(state.rsvps));
    };

    public func getInviteCodes(state: InviteLinksSystemState) : [InviteCode] {
        let inviteMap = Map.Make<Text>(Text.compare);
        Iter.toArray(inviteMap.vals(state.inviteCodes));
    };
}
