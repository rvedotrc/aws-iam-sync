var deepEqual = require('deep-equal');
var Q = require('q');

var AwsDataUtils = require('./aws-data-utils');

var isOutOfScope = function (name) {
    return !name.match(/^modav\./);
};

var doCreate = function (iam, key, detail) {
    console.log("Create policy", key, "as", JSON.stringify(detail));
    // TODO respect dryRun
    return AwsDataUtils.collectFromAws(iam, "createPolicy", { PolicyName: key, PolicyDocument: JSON.stringify(detail) });
};

var doConditionalUpdate = function (iam, key, gotDetail, wantDetail) {
    var activePolicyVersion = gotDetail.PolicyVersionList.filter(function (v) { return v.IsDefaultVersion; })[0];
    var activePolicy = JSON.parse(decodeURIComponent(activePolicyVersion.Document));

    if (gotDetail.Path !== '/') {
        throw "Unable to deal with policy "+key+" with path "+gotDetail.Path;
    } else if (deepEqual(activePolicy, wantDetail)) {
        console.log("Nothing to update for role", key);
        return Q(true);
    } else {
        console.log("Update role", key);
        // TODO respect dryRun
        // TODO: deal with whatever error we get from > 5 policy versions
        return AwsDataUtils.collectFromAws(iam, "createPolicyVersion", {
            PolicyArn: gotDetail.Arn,
            PolicyDocument: JSON.stringify(wantDetail),
            SetAsDefault: true
        });
    }
};

var doCreateUpdate = function (iam, wanted, got) {
    var outOfScopeNames = Object.keys(wanted).sort().filter(isOutOfScope);
    if (outOfScopeNames.length > 0) {
        throw "Wanted policy name(s) out of scope: " + JSON.stringify(outOfScopeNames);
    }

    var promises = [];

    // Create any that are missing
    // Also, update any that exist, but whose policies don't match what we want
    Object.keys(wanted).sort().map(function (k) {
        var existing = got.PolicyMap[k];
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
    console.log("TODO, delete unwanted inScope roles");
};

module.exports = {
    doCreateUpdate: doCreateUpdate,
    doDelete: doDelete
};
