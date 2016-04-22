var deepEqual = require('deep-equal');
var CanonicalJson = require('canonical-json');
var Q = require('q');

var AwsDataUtils = require('./aws-data-utils');
var SyncEngine = require('./sync-engine');

var Syncer = function (config, iam, syncOps, gotMapped, scopeChecker) {
    this.config = config;
    this.iam = iam;
    this.syncOps = syncOps;
    this.gotMapped = gotMapped;
    this.isInScope = function (e) {
        return scopeChecker.isGroupInScope(e);
    };
};

Syncer.prototype.syncInlinePolicies = function (group, want, got, skipDryRun) {
    var t = this;
    var sync = SyncEngine.sync(
        want,
        got,
        function (p) { return p.PolicyName; },
        deepEqual
    );

    return Q.all([
        Q.all(sync.create.map(function (p) {
            if (!skipDryRun) {
                console.log("putGroupPolicy (create)", group.GroupName, p.PolicyName);
                if (t.config.dryRun) return;
            }
            return AwsDataUtils.collectFromAws(t.iam, "putGroupPolicy", {
                GroupName: group.GroupName,
                PolicyName: p.PolicyName,
                PolicyDocument: JSON.stringify(p.PolicyDocument),
            });
        })),
        Q.all(sync.update.map(function (p) {
            if (!skipDryRun) {
                console.log("putGroupPolicy (update)", group.GroupName, p.want.PolicyName);
                console.log("  got:  " + JSON.stringify(p.got));
                console.log("  want: " + JSON.stringify(p.want));
                if (t.config.dryRun) return;
            }
            return AwsDataUtils.collectFromAws(t.iam, "putGroupPolicy", {
                GroupName: group.GroupName,
                PolicyName: p.want.PolicyName,
                PolicyDocument: JSON.stringify(p.want.PolicyDocument),
            });
        })),
        Q.all(sync.delete.map(function (p) {
            if (!skipDryRun) {
                console.log("deleteGroupPolicy", group.GroupName, p.PolicyName);
                if (t.config.dryRun) return;
            }
            return AwsDataUtils.collectFromAws(t.iam, "deleteGroupPolicy", {
                GroupName: group.GroupName,
                PolicyName: p.PolicyName,
            }).fail(AwsDataUtils.swallowError('NoSuchEntity'));
        })),
    ]);
};

Syncer.prototype.syncAttachedPolicies = function (group, want, got, skipDryRun) {
    var t = this;
    var sync = SyncEngine.sync(
        want,
        got,
        function (p) { return p.PolicyName; },
        function () { return true; } // same name is enough
    );

    if (sync.update.length > 0) throw 'Unexpected updates';

    return Q.all([
        Q.all(sync.create.map(function (p) {
            var arn = t.gotMapped.PolicyMap[p.PolicyName].Arn;
            if (!arn) {
                console.log("Failed to find arn of policy", p, "in", t.gotMapped.PolicyMap);
                throw 'Missing PolicyArn';
            }
            if (!skipDryRun) {
                console.log("attachGroupPolicy", group.GroupName, p.PolicyName);
                if (t.config.dryRun) return;
            }
            return AwsDataUtils.collectFromAws(t.iam, "attachGroupPolicy", {
                GroupName: group.GroupName,
                PolicyArn: arn,
            });
        })),
        Q.all(sync.delete.map(function (p) {
            if (!skipDryRun) {
                console.log("detachGroupPolicy", group.GroupName, p.PolicyName);
                if (t.config.dryRun) return;
            }
            return AwsDataUtils.collectFromAws(t.iam, "detachGroupPolicy", {
                GroupName: group.GroupName,
                PolicyArn: p.PolicyArn,
            }).fail(AwsDataUtils.swallowError('NoSuchEntity'));
        })),
    ]);
};

Syncer.prototype.doCreate = function (want) {
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
            Q(t).invoke("syncInlinePolicies", want, want.GroupPolicyList, [], true),
            Q(t).invoke("syncAttachedPolicies", want, want.AttachedManagedPolicies, [], true)
        ]);
    });
};

Syncer.prototype.doCreates = function () {
    return this.invokeForEach("doCreate", this.syncOps.create);
};

Syncer.prototype.doUpdate = function (e) {
    var t = this;

    if (!this.isInScope(e.got)) {
        throw "Refusing to update out-of-scope group " + JSON.stringify(e.got);
    }

    var base = Q(true);

    if (e.want.Path != e.got.Path) {
        console.log("Update group", e.got.GroupName, e.got.Path, e.want.Path);
        if (!t.config.dryRun) {
            base = AwsDataUtils.collectFromAws(t.iam, "updateGroup", {
                GroupName: e.got.GroupName,
                NewPath: e.want.Path,
            });
        }
    }

    return base.then(function () {
        return Q.all([
            Q(t).invoke("syncInlinePolicies", e.want, e.want.GroupPolicyList, e.got.GroupPolicyList),
            Q(t).invoke("syncAttachedPolicies", e.want, e.want.AttachedManagedPolicies, e.got.AttachedManagedPolicies),
        ]);
    });
};

Syncer.prototype.doUpdates = function () {
    return this.invokeForEach("doUpdate", this.syncOps.update);
};

Syncer.prototype.doCreatesUpdates = function () {
    return Q.all([
        Q(this).invoke("doCreates"),
        Q(this).invoke("doUpdates"),
    ]);
};

Syncer.prototype.doDelete = function (got) {
    var t = this;
    if (!this.isInScope(got)) return;

    console.log("Delete group", CanonicalJson(got, null, 2));
    if (this.config.dryRun) return;

    return Q.all([
        this.syncAttachedPolicies(got, [], got.AttachedManagedPolicies, true),
        this.syncInlinePolicies(got, [], got.GroupPolicyList, true),
    ])
        .then(function () {
            return AwsDataUtils.collectFromAws(t.iam, "deleteGroup", { GroupName: got.GroupName })
                .fail(AwsDataUtils.swallowError('NoSuchEntity'));
        });
};

Syncer.prototype.doDeletes = function () {
    return this.invokeForEach("doDelete", this.syncOps.delete);
};

Syncer.prototype.invokeForEach = function (method, list) {
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

var sync = function (config, iam, wanted, gotMapped, scopeChecker) {
    var syncOps = SyncEngine.sync(
        wanted.GroupDetailList,
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

    return new Syncer(config, iam, syncOps, gotMapped, scopeChecker);
};

module.exports = {
    sync: sync,
};
