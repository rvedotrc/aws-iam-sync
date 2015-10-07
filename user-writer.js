var deepEqual = require('deep-equal');
var CanonicalJson = require('canonical-json');
var Q = require('q');

var AwsDataUtils = require('./aws-data-utils');
var SyncEngine = require('./sync-engine');

var UserWriterSyncer = function (config, iam, syncOps, gotMapped) {
    this.config = config;
    this.iam = iam;
    this.syncOps = syncOps;
    this.gotMapped = gotMapped;
    this.isInScope = function (e) {
        return e.UserName.match(/^modav\.sync/);
    };
};

UserWriterSyncer.prototype.syncGroups = function (user, want, got) {
    var t = this;
    var sync = SyncEngine.sync(
        want,
        got
    );

    return Q.all([
        Q.all(sync.create.map(function (g) {
            return AwsDataUtils.collectFromAws(t.iam, "addUserToGroup", {
                UserName: user.UserName,
                GroupName: g
            });
        })),
        Q.all(sync.delete.map(function (p) {
            return AwsDataUtils.collectFromAws(t.iam, "removeUserFromGroup", {
                UserName: user.UserName,
                GroupName: g
            });
        })),
    ]);
};

UserWriterSyncer.prototype.syncInlinePolicies = function (user, want, got) {
    var t = this;
    var sync = SyncEngine.sync(
        want,
        got,
        function (p) { return p.PolicyName; },
        deepEqual
    );

    return Q.all([
        Q.all(sync.create.map(function (p) {
            return AwsDataUtils.collectFromAws(t.iam, "putUserPolicy", {
                UserName: user.UserName,
                PolicyName: p.PolicyName,
                PolicyDocument: JSON.stringify(p.PolicyDocument),
            });
        })),
        Q.all(sync.update.map(function (p) {
            return AwsDataUtils.collectFromAws(t.iam, "putUserPolicy", {
                UserName: user.UserName,
                PolicyName: p.want.PolicyName,
                PolicyDocument: JSON.stringify(p.want.PolicyDocument),
            });
        })),
        Q.all(sync.delete.map(function (p) {
            return AwsDataUtils.collectFromAws(t.iam, "deleteUserPolicy", {
                UserName: user.UserName,
                PolicyName: p.PolicyName,
            });
        })),
    ]);
};

UserWriterSyncer.prototype.syncAttachedPolicies = function (user, want, got) {
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
            return AwsDataUtils.collectFromAws(t.iam, "attachUserPolicy", {
                UserName: user.UserName,
                PolicyArn: arn,
            });
        })),
        Q.all(sync.update.map(function (p) {
            return AwsDataUtils.collectFromAws(t.iam, "attachUserPolicy", {
                UserName: user.UserName,
                PolicyArn: t.gotMapped.PolicyMap[p.PolicyName].Arn,
            });
        })),
        Q.all(sync.delete.map(function (p) {
            return AwsDataUtils.collectFromAws(t.iam, "detachUserPolicy", {
                UserName: user.UserName,
                PolicyArn: p.PolicyArn,
            });
        })),
    ]);
};

UserWriterSyncer.prototype.doCreate = function (want) {
    var t = this;
    if (!this.isInScope(want)) {
        throw "Refusing to create out-of-scope user " + JSON.stringify(want);
    }

    console.log("Create user", CanonicalJson(want, null, 2));
    if (this.config.dryRun) return;

    return AwsDataUtils.collectFromAws(this.iam, "createUser", {
        UserName: want.UserName,
        Path: want.Path,
    }).then(function (r) {
        t.gotMapped.UserDetailMap[r.User.UserName] = r.User;
        return Q.all([
            Q(t).invoke("syncGroups", want, want.GroupList, []),
            Q(t).invoke("syncInlinePolicies", want, want.UserPolicyList, []),
            Q(t).invoke("syncAttachedPolicies", want, want.AttachedManagedPolicies, [])
        ]);
    });
};

UserWriterSyncer.prototype.doCreates = function () {
    return this.invokeForEach("doCreate", this.syncOps.create);
};

UserWriterSyncer.prototype.doUpdate = function (e) {
    var t = this;

    if (!this.isInScope(e.got)) {
        throw "Refusing to update out-of-scope user " + JSON.stringify(e.got);
    }

    console.log("Update user", CanonicalJson(e, null, 2));
    if (this.config.dryRun) return;

    var base;

    if (e.want.Path != e.got.Path) {
        base = AwsDataUtils.collectFromAws(t.iam, "updateUser", {
            UserName: e.got.UserName,
            NewPath: e.want.Path,
        });
    } else {
        base = Q(true);
    }

    return base.then(function () {
        return Q.all([
            Q(t).invoke("syncGroups", e.want, e.want.GroupList, e.got.GroupList),
            Q(t).invoke("syncInlinePolicies", e.want, e.want.UserPolicyList, e.got.UserPolicyList),
            Q(t).invoke("syncAttachedPolicies", e.want, e.want.AttachedManagedPolicies, e.got.AttachedManagedPolicies),
        ]);
    });
};

UserWriterSyncer.prototype.doUpdates = function () {
    return this.invokeForEach("doUpdate", this.syncOps.update);
};

UserWriterSyncer.prototype.doCreatesUpdates = function () {
    return Q.all([
        Q(this).invoke("doCreates"),
        Q(this).invoke("doUpdates"),
    ]);
};

UserWriterSyncer.prototype.doDelete = function (got) {
    var t = this;
    if (!this.isInScope(got)) return;

    console.log("Delete user", CanonicalJson(got, null, 2));
    if (this.config.dryRun) return;

    return Q.all([
        this.syncGroups(got, [], got.GroupList),
        this.syncAttachedPolicies(got, [], got.AttachedManagedPolicies)
    ]).then(function () {
        return AwsDataUtils.collectFromAws(t.iam, "deleteUser", { UserName: got.UserName });
    });
};

UserWriterSyncer.prototype.doDeletes = function () {
    return this.invokeForEach("doDelete", this.syncOps.delete);
};

UserWriterSyncer.prototype.invokeForEach = function (method, list) {
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
        gotMapped.UserDetailList,
        function (e) { return e.UserName; },
        function (w, g) {
            return w.UserName === g.UserName &&
                w.Path === g.Path &&
                deepEqual(
                    w.GroupList.sort(),
                    g.GroupList.sort()
                ) &&
                deepEqual(
                    w.AttachedManagedPolicies.map(function (p) { return p.PolicyName; }).sort(),
                    g.AttachedManagedPolicies.map(function (p) { return p.PolicyName; }).sort()
                ) &&
                deepEqual(
                    sortByPolicyName(w.UserPolicyList),
                    sortByPolicyName(g.UserPolicyList) 
                );
        }
    );

    return new UserWriterSyncer(config, iam, syncOps, gotMapped);
};

module.exports = {
    sync: sync,
};
