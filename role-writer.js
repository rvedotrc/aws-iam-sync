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
        return scopeChecker.isRoleInScope(e);
    };
};

Syncer.prototype.syncInlinePolicies = function (role, want, got, skipDryRun) {
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
                console.log("putRolePolicy (create)", role.RoleName, p.PolicyName);
                if (t.config.dryRun) return;
            }
            return AwsDataUtils.collectFromAws(t.iam, "putRolePolicy", {
                RoleName: role.RoleName,
                PolicyName: p.PolicyName,
                PolicyDocument: JSON.stringify(p.PolicyDocument),
            });
        })),
        Q.all(sync.update.map(function (p) {
            if (!skipDryRun) {
                console.log("putRolePolicy (update)", role.RoleName, p.want.PolicyName);
                console.log("  got:  " + JSON.stringify(p.got));
                console.log("  want: " + JSON.stringify(p.want));
                if (t.config.dryRun) return;
            }
            return AwsDataUtils.collectFromAws(t.iam, "putRolePolicy", {
                RoleName: role.RoleName,
                PolicyName: p.want.PolicyName,
                PolicyDocument: JSON.stringify(p.want.PolicyDocument),
            });
        })),
        Q.all(sync.delete.map(function (p) {
            if (!skipDryRun) {
                console.log("deleteRolePolicy", role.RoleName, p.PolicyName);
                if (t.config.dryRun) return;
            }
            return AwsDataUtils.collectFromAws(t.iam, "deleteRolePolicy", {
                RoleName: role.RoleName,
                PolicyName: p.PolicyName,
            }).fail(AwsDataUtils.swallowError('NoSuchEntity'));
        })),
    ]);
};

Syncer.prototype.syncAttachedPolicies = function (role, want, got, skipDryRun) {
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
                console.log("attachRolePolicy", role.RoleName, p.PolicyName);
                if (t.config.dryRun) return;
            }
            return AwsDataUtils.collectFromAws(t.iam, "attachRolePolicy", {
                RoleName: role.RoleName,
                PolicyArn: arn,
            });
        })),
        Q.all(sync.delete.map(function (p) {
            if (!skipDryRun) {
                console.log("detachRolePolicy", role.RoleName, p.PolicyName);
                if (t.config.dryRun) return;
            }
            return AwsDataUtils.collectFromAws(t.iam, "detachRolePolicy", {
                RoleName: role.RoleName,
                PolicyArn: p.PolicyArn,
            }).fail(AwsDataUtils.swallowError('NoSuchEntity'));
        })),
    ]);
};

Syncer.prototype.doCreate = function (want) {
    var t = this;
    if (!this.isInScope(want)) {
        throw "Refusing to create out-of-scope role " + JSON.stringify(want);
    }

    console.log("Create role", want.RoleName, CanonicalJson(want, null, 2));
    if (this.config.dryRun) return;

    return AwsDataUtils.collectFromAws(this.iam, "createRole", {
        RoleName: want.RoleName,
        Path: want.Path,
        AssumeRolePolicyDocument: JSON.stringify(want.AssumeRolePolicyDocument),
    }).then(function (r) {
        t.gotMapped.RoleDetailMap[r.Role.RoleName] = r.Role;
        return Q.all([
            Q(t).invoke("syncInlinePolicies", want, want.RolePolicyList, [], true),
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
        throw "Refusing to update out-of-scope role " + JSON.stringify(e.got);
    }

    if (e.want.Path != e.got.Path || !deepEqual(e.want.AssumeRolePolicyDocument, e.got.AssumeRolePolicyDocument)) {
        console.log("Update role (delete & create)", e.got.RoleName, CanonicalJson(e, null, 2));
        if (this.config.dryRun) return;
        return t.doDelete(e.got).then(function () { return t.doCreate(e.want); });
    }

    return Q.all([
        Q(t).invoke("syncInlinePolicies", e.want, e.want.RolePolicyList, e.got.RolePolicyList),
        Q(t).invoke("syncAttachedPolicies", e.want, e.want.AttachedManagedPolicies, e.got.AttachedManagedPolicies),
    ]);
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

    console.log("Delete role", got.RoleName, CanonicalJson(got, null, 2));
    if (this.config.dryRun) return;

    return Q.all([
        this.syncAttachedPolicies(got, [], got.AttachedManagedPolicies, true),
        this.syncInlinePolicies(got, [], got.RolePolicyList, true),
    ])
        .then(function () {
            return AwsDataUtils.collectFromAws(t.iam, "deleteRole", { RoleName: got.RoleName })
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
        wanted.RoleDetailList,
        gotMapped.RoleDetailList,
        function (e) { return e.RoleName; },
        function (w, g) {
            return w.RoleName === g.RoleName &&
                w.Path === g.Path &&
                deepEqual(w.AssumeRolePolicyDocument, g.AssumeRolePolicyDocument) &&
                deepEqual(
                    w.AttachedManagedPolicies.map(function (p) { return p.PolicyName; }).sort(),
                    g.AttachedManagedPolicies.map(function (p) { return p.PolicyName; }).sort()
                ) &&
                deepEqual(
                    sortByPolicyName(w.RolePolicyList),
                    sortByPolicyName(g.RolePolicyList)
                );
        }
    );

    return new Syncer(config, iam, syncOps, gotMapped, scopeChecker);
};

module.exports = {
    sync: sync,
};
