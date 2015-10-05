var deepEqual = require('deep-equal');
var CanonicalJson = require('canonical-json');
var Q = require('q');

var AwsDataUtils = require('./aws-data-utils');
var SyncEngine = require('./sync-engine');

var PolicyWriterSyncer = function (config, iam, syncOps, gotMapped) {
    this.config = config;
    this.iam = iam;
    this.syncOps = syncOps;
    this.gotMapped = gotMapped;
    this.isInScope = function (e) {
        return e.PolicyName.match(/^modav\./);
    };
};

PolicyWriterSyncer.prototype.deleteAllInactivePolicyVersions = function (gotPolicy) {
    var t = this;
    return Q.all(
        gotPolicy.PolicyVersionList.filter(function (pv) {
            return !pv.IsDefaultVersion;
        }).map(function (pv) {
            return Q.all([ gotPolicy.Arn, pv.VersionId ]).spread(function (arn, versionId) {
                return AwsDataUtils.collectFromAws(t.iam, "deletePolicyVersion", { PolicyArn: arn, VersionId: versionId });
            });
        })
    );
};

PolicyWriterSyncer.prototype.doCreate = function (want) {
    var t = this;
    if (!this.isInScope(want)) {
        throw "Refusing to create out-of-scope policy " + JSON.stringify(want);
    }

    console.log("Create policy", CanonicalJson(want, null, 2));
    if (this.config.dryRun) return;

    return AwsDataUtils.collectFromAws(this.iam, "createPolicy", {
        PolicyName: want.PolicyName,
        Path: want.Path,
        Description: want.Description,
        PolicyDocument: JSON.stringify(want.PolicyDocument),
    }).then(function (r) {
        t.gotMapped.PolicyMap[r.Policy.PolicyName] = r.Policy;
    });
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
    var t = this;

    if (!this.isInScope(e.got)) {
        throw "Refusing to update out-of-scope policy " + JSON.stringify(e.got);
    }

    console.log("Update policy", CanonicalJson(e, null, 2));
    if (this.config.dryRun) return;

    if (e.want.Path != e.got.Path) {
        console.log("Update requires delete & create", CanonicalJson(e, null, 2));
        return t.doDelete(e.got).then(function () { return t.doCreate(e.want); });
    }

    return t.deleteAllInactivePolicyVersions(e.got)
        .then(function () {
            return AwsDataUtils.collectFromAws(t.iam, "createPolicyVersion", {
                PolicyArn: e.got.Arn,
                PolicyDocument: JSON.stringify(e.want.PolicyDocument),
                SetAsDefault: true,
            });
        });
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
    var t = this;
    if (!this.isInScope(got)) return;

    console.log("Delete policy", CanonicalJson(got, null, 2));
    if (this.config.dryRun) return;

    return this.deleteAllInactivePolicyVersions(got)
        .then(function () {
            return AwsDataUtils.collectFromAws(t.iam, "deletePolicy", { PolicyArn: got.Arn });
        });
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

var sync = function (config, iam, wanted, gotMapped) {
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

    return new PolicyWriterSyncer(config, iam, syncOps, gotMapped);
};

module.exports = {
    sync: sync,
};
