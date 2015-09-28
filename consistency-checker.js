var checkConsistency = function (roles, policies) {
    console.log("roles =", roles);
    console.log("policies =", policies);

    // Check that each policy referenced by a role is one that has been
    // defined
    var badPolicies = {};
    Object.keys(roles).map(function (r) {
        roles[r].policies.map(function (p) {
            if (!policies["modav."+p]) badPolicies[p] = true;
        });
    });

    if (Object.keys(badPolicies).length > 0) {
        throw "The following policies are referenced by roles but not defined: " + JSON.stringify( Object.keys(badPolicies).sort() );
    }
};

module.exports = {
    checkConsistency: checkConsistency
};
