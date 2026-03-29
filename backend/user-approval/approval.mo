import OrderedMap "mo:base/OrderedMap";
import Principal "mo:base/Principal";
import Iter "mo:base/Iter";
import AccessControl "../authorization/access-control";

module {
    public type ApprovalStatus = {
        #approved;
        #rejected;
        #pending;
    };

    public type UserApprovalState = {
        var approvalStatus : OrderedMap.Map<Principal, ApprovalStatus>;
    };

    public func initState(accessControlState : AccessControl.AccessControlState) : UserApprovalState {
        let principalMap = OrderedMap.Make<Principal>(Principal.compare);
        var approvalStatus = principalMap.empty<ApprovalStatus>();
        for ((principal, role) in principalMap.entries(accessControlState.userRoles)) {
            let status = if (role == #admin) {
                #approved;
            } else {
                #pending;
            };
            approvalStatus := principalMap.put(approvalStatus, principal, status);
        };
        { var approvalStatus };
    };

    public func isApproved(state : UserApprovalState, caller : Principal) : Bool {
        let principalMap = OrderedMap.Make<Principal>(Principal.compare);
        principalMap.get(state.approvalStatus, caller) == ?#approved;
    };

    public func requestApproval(state : UserApprovalState, caller : Principal) {
        let principalMap = OrderedMap.Make<Principal>(Principal.compare);
        if (principalMap.get(state.approvalStatus, caller) == null) {
            setApproval(state, caller, #pending);
        };
    };

    public func setApproval(state : UserApprovalState, user : Principal, approval : ApprovalStatus) {
        let principalMap = OrderedMap.Make<Principal>(Principal.compare);
        state.approvalStatus := principalMap.put(state.approvalStatus, user, approval);
    };

    public type UserApprovalInfo = {
        principal : Principal;
        status : ApprovalStatus;
    };

    public func listApprovals(state : UserApprovalState) : [UserApprovalInfo] {
        let principalMap = OrderedMap.Make<Principal>(Principal.compare);
        let infos = principalMap.map<ApprovalStatus, UserApprovalInfo>(
            state.approvalStatus,
            func(principal, status) {
                {
                    principal;
                    status;
                };
            }
        );
        Iter.toArray(principalMap.vals(infos));
    };
};
