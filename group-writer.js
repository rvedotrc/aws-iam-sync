var deepEqual = require('deep-equal');
var CanonicalJson = require('canonical-json');
var Q = require('q');

var AwsDataUtils = require('./aws-data-utils');
var SyncEngine = require('./sync-engine');

var GroupWriterSyncer = function (config, iam, syncOps, gotMapped) {
    this.config = config;
    this.iam = iam;
    this.syncOps = syncOps;
    this.gotMapped = gotMapped;
    this.isInScope = function (e) {
        return e.GroupName.match(/^modav\.sync/);
    };
};

GroupWriterSyncer.prototype.syncInlinePolicies = function (group, want, got) {
    var t = this;
    var sync = SyncEngine.sync(
        want,
        got,
        function (p) { return p.PolicyName; },
        deepEqual
    );

    return Q.all([
        Q.all(sync.create.map(function (p) {
            return AwsDataUtils.collectFromAws(t.iam, "putGroupPolicy", {
                GroupName: group.GroupName,
                PolicyName: p.PolicyName,
                PolicyDocument: JSON.stringify(p.PolicyDocument),
            });
        })),
        Q.all(sync.update.map(function (p) {
            return AwsDataUtils.collectFromAws(t.iam, "putGroupPolicy", {
                GroupName: group.GroupName,
                PolicyName: p.want.PolicyName,
                PolicyDocument: JSON.stringify(p.want.PolicyDocument),
            });
        })),
        Q.all(sync.delete.map(function (p) {
            return AwsDataUtils.collectFromAws(t.iam, "deleteGroupPolicy", {
                GroupName: group.GroupName,
                PolicyName: p.PolicyName,
            });
        })),
    ]);
};

GroupWriterSyncer.prototype.syncAttachedPolicies = function (group, want, got) {
    var t = this;
    var sync = SyncEngine.sync(
        want,
        got,
        function (p) { return p.PolicyName; },
        function () { return true; } // same name is enough
    );

    return Q.all([
        Q.all(sync.create.map(function (p) {
            var arn = t.gotMapped.PolicyMap[p.PolicyName].Arn;
            if (!arn) {
                console.log("Failed to find arn of policy", p, "in", t.gotMapped.PolicyMap);
                throw 'Missing PolicyArn';
            }
            return AwsDataUtils.collectFromAws(t.iam, "attachGroupPolicy", {
                GroupName: group.GroupName,
                PolicyArn: arn,
            });
        })),
        Q.all(sync.update.map(function (p) {
            return AwsDataUtils.collectFromAws(t.iam, "attachGroupPolicy", {
                GroupName: group.GroupName,
                PolicyArn: t.gotMapped.PolicyMap[p.PolicyName].Arn,
            });
        })),
        Q.all(sync.delete.map(function (p) {
            return AwsDataUtils.collectFromAws(t.iam, "detachGroupPolicy", {
                GroupName: group.GroupName,
                PolicyArn: p.PolicyArn,
            });
        })),
    ]);
};

GroupWriterSyncer.prototype.doCreate = function (want) {
    var t = this;
    if (!this.isInScope(want)) {
        throw "Refusing to create out-of-scope group " + JSON.stringify(want);
    }

    console.log("Create group", CanonicalJson(want, null, 2));
    if (this.config.dryRun) return;

    return AwsDataUtils.collectFromAws(this.iam, "createGroup", {
        GroupName: want.GroupName,
        Path: want.Path,
    }).then(function (r) {
        t.gotMapped.GroupDetailMap[r.Group.GroupName] = r.Group;
        return Q.all([
            Q(t).invoke("syncInlinePolicies", want, want.GroupPolicyList, []),
            Q(t).invoke("syncAttachedPolicies", want, want.AttachedManagedPolicies, [])
        ]);
    });
};

GroupWriterSyncer.prototype.doCreates = function () {
    return this.invokeForEach("doCreate", this.syncOps.create);
};

GroupWriterSyncer.prototype.doUpdate = function (e) {
    var t = this;

    if (!this.isInScope(e.got)) {
        throw "Refusing to update out-of-scope group " + JSON.stringify(e.got);
    }

    console.log("Update group", CanonicalJson(e, null, 2));
    if (this.config.dryRun) return;

    var base;

    if (e.want.Path != e.got.Path) {
        base = AwsDataUtils.collectFromAws(t.iam, "updateGroup", {
            GroupName: e.got.GroupName,
            NewPath: e.want.Path,
        });
    } else {
        base = Q(true);
    }

    return base.then(function () {
        return Q.all([
            Q(t).invoke("syncInlinePolicies", e.want, e.want.GroupPolicyList, e.got.GroupPolicyList),
            Q(t).invoke("syncAttachedPolicies", e.want, e.want.AttachedManagedPolicies, e.got.AttachedManagedPolicies),
        ]);
    });
};

GroupWriterSyncer.prototype.doUpdates = function () {
    return this.invokeForEach("doUpdate", this.syncOps.update);
};

GroupWriterSyncer.prototype.doCreatesUpdates = function () {
    return Q.all([
        Q(this).invoke("doCreates"),
        Q(this).invoke("doUpdates"),
    ]);
};

GroupWriterSyncer.prototype.doDelete = function (got) {
    var t = this;
    if (!this.isInScope(got)) return;

    console.log("Delete group", CanonicalJson(got, null, 2));
    if (this.config.dryRun) return;

    return this.syncAttachedPolicies(got, [], got.AttachedManagedPolicies)
        .then(function () {
            return AwsDataUtils.collectFromAws(t.iam, "deleteGroup", { GroupName: got.GroupName });
        });
};

GroupWriterSyncer.prototype.doDeletes = function () {
    return this.invokeForEach("doDelete", this.syncOps.delete);
};

GroupWriterSyncer.prototype.invokeForEach = function (method, list) {
    var t = this;
    return Q.all(
        list.map(function (e) {
            return Q(t).invoke(method, e);
        })
    );
};

var compareByPolicyName = function (a, b) {
    if (a.PolicyName < b.PolicyName) return -1;
    if (a.PolicyName > b.PolicyName) return +1;
    return 0;
};

var sortByPolicyName = function (l) {
    return l.sort(compareByPolicyName);
};

var sync = function (config, iam, wanted, gotMapped) {
    var syncOps = SyncEngine.sync(
        wanted,
        gotMapped.GroupDetailList,
        function (e) { return e.GroupName; },
        function (w, g) {
            return w.GroupName === g.GroupName &&
                w.Path === g.Path &&
                deepEqual(
                    w.AttachedManagedPolicies.map(function (p) { return p.PolicyName; }).sort(),
                    g.AttachedManagedPolicies.map(function (p) { return p.PolicyName; }).sort()
                ) &&
                deepEqual(
                    sortByPolicyName(w.GroupPolicyList),
                    sortByPolicyName(g.GroupPolicyList) 
                );
        }
    );

    return new GroupWriterSyncer(config, iam, syncOps, gotMapped);
};

module.exports = {
    sync: sync,
};
