var checkConsistency = function (roles, policies, users, groups) {
    console.log("roles =", roles);
    console.log("policies =", policies);
    console.log("users =", users);
    console.log("groups =", groups);

    // Check that each policy referenced by a role is one that has been
    // defined
    var badPolicies = {};
    Object.keys(roles).map(function (r) {
        roles[r].AttachedManagedPolicies.map(function (p) {
            if (!policies[p.PolicyName]) badPolicies[p] = true;
        });
    });

    if (Object.keys(badPolicies).length > 0) {
        throw "The following policies are referenced by roles but not defined: " + JSON.stringify( Object.keys(badPolicies).sort() );
    }
};

module.exports = {
    checkConsistency: checkConsistency
};
