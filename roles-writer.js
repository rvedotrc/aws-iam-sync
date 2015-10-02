var deepEqual = require('deep-equal');
var Q = require('q');

var AwsDataUtils = require('./aws-data-utils');

var isOutOfScope = function (def) {
    return !def.Path.match(/^\/x509\//);
};

var doCreate = function (iam, key, detail) {
    console.log("Create role", key, "as", JSON.stringify(detail));
    // TODO respect dryRun
    // return AwsDataUtils.collectFromAws(iam, "createPolicy", { PolicyName: key, PolicyDocument: JSON.stringify(detail) });
};

var doConditionalUpdate = function (iam, key, gotDetail, wantDetail) {
    // want: name, path, policies
    // got: RoleName, Path, AttachedManagedPolicies
    // (and Arn, RolePolicyList, AssumeRolePolicyDocument).
    wantDetail.RolePolicyList = wantDetail.RolePolicyList || [];
    wantDetail.AttachedManagedPolicies = wantDetail.AttachedManagedPolicies || [];

    console.log("Update role", key, "\n to", JSON.stringify(wantDetail), "\n from", JSON.stringify(gotDetail));

    // Things that can only be set at creation time: RoleName, Path, AssumeRolePolicyDocument.
    // If any of these things are wrong then we'll need to delete+create.
    var activeDoc = JSON.parse(decodeURIComponent(gotDetail.AssumeRolePolicyDocument));
    if (wantDetail.Path !== gotDetail.Path || !deepEqual(wantDetail.AssumeRolePolicyDocument, activeDoc)) {
        throw 'TODO, need delete + create role';
    }

    // Things we can change: AttachedManagedPolicies, RolePolicyList.

    var promises = [];

    wantDetail.RolePolicyList.map(function (want) {
        var got = gotDetail.RolePolicyList.filter(function (g) { return(g.PolicyName === want.PolicyName); })[0];
        if (!got || !deepEqual(want.PolicyDocument, JSON.parse(decodeURIComponent(got.PolicyDocument)))) {
            promises.push(
                Q(true).then(function () {
                    return AwsDataUtils.collectFromAws(iam, "putRolePolicy", {
                        RoleName: wantDetail.RoleName,
                        PolicyName: want.PolicyName,
                        PolicyDocument: JSON.stringify(want.PolicyDocument)
                    });
                })
            );
        }
    });

    gotDetail.RolePolicyList.map(function (got) {
        var want = wantDetail.RolePolicyList.filter(function (e) { return(e.PolicyName === got.PolicyName); })[0];
        if (!want) {
            promises.push(
                Q(true).then(function () {
                    return AwsDataUtils.collectFromAws(iam, "deleteRolePolicy", {
                        RoleName: wantDetail.RoleName,
                        PolicyName: got.PolicyName
                    });
                })
            );
        }
    });

    wantDetail.AttachedManagedPolicies.map(function (wantAttached) {
        var gotAttached = gotDetail.AttachedManagedPolicies.filter(function (e) { return(e.PolicyName === wantAttached.PolicyName); })[0];
        if (!got) {
            // FIXME need to know the PolicyArn of the managed policy we wish
            // to attach.
            promises.push(
                Q(true).then(function () {
                    return AwsDataUtils.collectFromAws(iam, "attachRolePolicy", {
                        RoleName: wantDetail.RoleName,
                        PolicyArn: want.PolicyArn
                    });
                })
            );
        }
    });

    return Q.all(promises);
};

var doCreateUpdate = function (iam, wanted, got) {
    var outOfScopeNames = Object.keys(wanted).sort()
        .filter(function (name) {
            return isOutOfScope(wanted[name]);
        });
    if (outOfScopeNames.length > 0) {
        throw "Wanted policy name(s) out of scope: " + JSON.stringify(outOfScopeNames);
    }

    var promises = [];

    // Create any that are missing
    // Also, update any that exist, but whose policies don't match what we want
    Object.keys(wanted).sort().map(function (k) {
        var existing = got.RoleDetailMap[k];
        if (existing) {
            promises.push(
                Q.all([ iam, k, existing, wanted[k] ]).spread(doConditionalUpdate)
            );
        } else {
            promises.push(
                Q.all([ iam, k, wanted[k] ]).spread(doCreate)
            );
        }
    });

    return Q.all(promises);
};

var doDelete = function (iam, wanted, got) {
};

module.exports = {
    doCreateUpdate: doCreateUpdate,
    doDelete: doDelete
};
