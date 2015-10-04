var checkConsistency = function (roles, policies, users, groups) {
    // Check that each policy referenced by a role/user/group is one that has
    // been defined
    var badPolicies = {};
    [ roles, users, groups ].each(function (items) {
        items.map(function (i) {
            i.attachedManagedPolicies.map(function (wantPolicy) {
                if (!policies.some(function (p) { return p.PolicyName === wantPolicy.PolicyName; })) {
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
    users.map(function (i) {
        i.groups.map(function (wantGroup) {
            if (!groups.some(function (g) { return g.GroupName === wantGroup.GroupName; })) {
                badGroups[wantGroup.GroupName] = true;
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
