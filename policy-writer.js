var deepEqual = require('deep-equal');
var CanonicalJson = require('canonical-json');
var Q = require('q');

var AwsDataUtils = require('./aws-data-utils');
var SyncEngine = require('./sync-engine');

// var doCreate = function (iam, key, detail) {
//     console.log("Create policy", key, "as", JSON.stringify(detail));
//     // TODO respect dryRun
//     return AwsDataUtils.collectFromAws(iam, "createPolicy", { PolicyName: key, PolicyDocument: JSON.stringify(detail) });
// };
// 
// var doConditionalUpdate = function (iam, key, gotDetail, wantDetail) {
//     var activePolicyVersion = gotDetail.PolicyVersionList.filter(function (v) { return v.IsDefaultVersion; })[0];
//     var activePolicy = JSON.parse(decodeURIComponent(activePolicyVersion.Document));
// 
//     if (gotDetail.Path !== '/') {
//         throw "Unable to deal with policy "+key+" with path "+gotDetail.Path;
//     } else if (deepEqual(activePolicy, wantDetail)) {
//         // console.log("Nothing to update for role", key);
//         return Q(true);
//     } else {
//         console.log("Update role", key);
//         // TODO respect dryRun
//         return deleteAllInactivePolicyVersions(iam, gotDetail)
//             .then(function () {
//                 return AwsDataUtils.collectFromAws(iam, "createPolicyVersion", {
//                     PolicyArn: gotDetail.Arn,
//                     PolicyDocument: JSON.stringify(wantDetail),
//                     SetAsDefault: true
//                 });
//             });
//     }
// };
// 
// var deleteAllInactivePolicyVersions = function (iam, gotPolicy) {
//     return Q.all(
//         gotPolicy.PolicyVersionList.filter(function (pv) {
//             return !pv.IsDefaultVersion;
//         }).map(function (pv) {
//             return Q.all([ gotPolicy.Arn, pv.VersionId ]).spread(function (arn, versionId) {
//                 return AwsDataUtils.collectFromAws(iam, "deletePolicyVersion", { PolicyArn: arn, VersionId: versionId });
//             });
//         })
//     );
// };
// 
// var doCreateUpdate = function (iam, wanted, got) {
//     var outOfScopeNames = Object.keys(wanted).sort().filter(isOutOfScope);
//     if (outOfScopeNames.length > 0) {
//         throw "Wanted policy name(s) out of scope: " + JSON.stringify(outOfScopeNames);
//     }
// 
//     var promises = [];
// 
//     // Create any that are missing
//     // Also, update any that exist, but whose policies don't match what we want
//     Object.keys(wanted).sort().map(function (k) {
//         var existing = got.PolicyMap[k];
//         if (existing) {
//             promises.push(
//                 Q.all([ iam, k, existing, wanted[k] ]).spread(doConditionalUpdate)
//             );
//         } else {
//             promises.push(
//                 Q.all([ iam, k, wanted[k] ]).spread(doCreate)
//             );
//         }
//     });
// 
//     return Q.all(promises);
// };
// 
// var doDeleteRole = function (iam, gotPolicy) {
//     console.log("Delete unwanted role " + gotPolicy.PolicyName);
//     // TODO respect dryRun
// 
//     return deleteAllInactivePolicyVersions(iam, gotPolicy)
//         .then(function () {
//             return AwsDataUtils.collectFromAws(iam, "deletePolicy", { PolicyArn: gotPolicy.Arn });
//         });
// };
// 
// var doDelete = function (iam, wanted, got) {
//     return Q.all(
//         Object.keys(got.PolicyMap).filter(function (n) {
//             return !isOutOfScope(n) && !wanted[n];
//         }).map(function (n) {
//             return Q.all([ iam, got.PolicyMap[n] ]).spread(doDeleteRole);
//         })
//     );
// };

var PolicyWriterSyncer = function (iam, syncOps, gotMapped) {
    this.iam = iam;
    this.syncOps = syncOps;
    this.gotMapped = gotMapped;
    this.isInScope = function (e) {
        return e.PolicyName.match(/^modav\./);
    };
};

PolicyWriterSyncer.prototype.doCreate = function (want) {
    if (!this.isInScope(want)) {
        throw "Refusing to create out-of-scope policy " + JSON.stringify(want);
    }
    console.log("TODO, create policy", CanonicalJson(want, null, 2));
};

PolicyWriterSyncer.prototype.doCreates = function () {
    var w = this;
    return Q.all(
        w.syncOps.create.map(function (want) {
            return Q(w).invoke("doCreate", want);
        })
    );
};

PolicyWriterSyncer.prototype.doUpdate = function (e) {
    if (!this.isInScope(e.got)) {
        throw "Refusing to update out-of-scope policy " + JSON.stringify(e.got);
    }
    console.log("TODO, update policy", CanonicalJson(e, null, 2));
};

PolicyWriterSyncer.prototype.doUpdates = function () {
    var w = this;
    return Q.all(
        w.syncOps.update.map(function (e) {
            return Q(w).invoke("doUpdate", e);
        })
    );
};

PolicyWriterSyncer.prototype.doCreatesUpdates = function () {
    return Q.all([
        Q(this).invoke("doCreates"),
        Q(this).invoke("doUpdates"),
    ]);
};

PolicyWriterSyncer.prototype.doDelete = function (got) {
    if (this.isInScope(got)) {
        console.log("TODO, delete policy", CanonicalJson(got, null, 2));
    }
};

PolicyWriterSyncer.prototype.doDeletes = function () {
    var w = this;
    return Q.all(
        w.syncOps.delete.map(function (got) {
            return Q(w).invoke("doDelete", got);
        })
    );
};

var findCurrentPolicyVersion = function (p) {
    return p.PolicyVersionList.filter(function (pv) { return pv.IsDefaultVersion; })[0];
};

var sync = function (iam, wanted, gotMapped) {
    var syncOps = SyncEngine.sync(
        wanted,
        gotMapped.Policies,
        function (e) { return e.PolicyName; },
        function (w, g) {
            return w.PolicyName === g.PolicyName &&
                w.Path === g.Path &&
                deepEqual(w.PolicyDocument, JSON.parse(decodeURIComponent(findCurrentPolicyVersion(g).Document)));
        }
    );

    return new PolicyWriterSyncer(iam, syncOps, gotMapped);
};

module.exports = {
    sync: sync,
};
