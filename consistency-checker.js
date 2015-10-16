
var checkMissingKeys = function (d, label, requiredKeys) {
    var missingKeys = requiredKeys.filter(function (k) {
        return !d.hasOwnProperty(k);
    });

    if (missingKeys.length > 0) {
        throw label + " is missing required keys " + missingKeys.join(",");
    }
};

var checkConsistency = function (wantedData, scopeChecker) {
    checkMissingKeys(wantedData, "data", [ "Policies", "RoleDetailList", "GroupDetailList", "UserDetailList" ]);

    wantedData.Policies.map(function (e) {
        checkMissingKeys(e, e.PolicyName || "unnamed policy", [ "PolicyName", "Path", "PolicyDocument" ]);
    });

    wantedData.RoleDetailList.map(function (e) {
        checkMissingKeys(e, e.RoleName || "unnamed role", [ "RoleName", "Path", "AssumeRolePolicyDocument", "AttachedManagedPolicies", "RolePolicyList" ]);
    });

    wantedData.GroupDetailList.map(function (e) {
        checkMissingKeys(e, e.GroupName || "unnamed group", [ "GroupName", "Path", "AttachedManagedPolicies", "GroupPolicyList" ]);
    });

    wantedData.UserDetailList.map(function (e) {
        checkMissingKeys(e, e.UserName || "unnamed user", [ "UserName", "Path", "AttachedManagedPolicies", "UserPolicyList", "GroupList" ]);
    });

    // Check that each policy referenced by a role/user/group is one that has
    // been defined
    var badPolicies = {};
    [ "RoleDetailList", "UserDetailList", "GroupDetailList" ].map(function (k) {
        wantedData[k].map(function (i) {
            i.AttachedManagedPolicies.map(function (wantPolicy) {
                if (!wantedData.Policies.some(function (p) { return p.PolicyName === wantPolicy.PolicyName; })) {
                    badPolicies[wantPolicy.PolicyName] = true;
                }
            });
        });
    });

    if (Object.keys(badPolicies).length > 0) {
        throw "The following policies are referenced by roles/users/groups but not defined: " + JSON.stringify( Object.keys(badPolicies).sort() );
    }

    // Check that each group referenced by a user is one that has been defined
    var badGroups = {};
    wantedData.UserDetailList.map(function (i) {
        i.GroupList.map(function (wantGroup) {
            if (!wantedData.GroupDetailList.some(function (g) { return g.GroupName === wantGroup; })) {
                badGroups[wantGroup] = true;
            }
        });
    });

    if (Object.keys(badGroups).length > 0) {
        throw "The following groups are referenced by users but not defined: " + JSON.stringify( Object.keys(badGroups).sort() );
    }
};

module.exports = {
    checkConsistency: checkConsistency
};
