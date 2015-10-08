var deepEqual = require('deep-equal');
var CanonicalJson = require('canonical-json');
var Q = require('q');

var AwsDataUtils = require('./aws-data-utils');
var SyncEngine = require('./sync-engine');

var RoleWriterSyncer = function (config, iam, syncOps, gotMapped) {
    this.config = config;
    this.iam = iam;
    this.syncOps = syncOps;
    this.gotMapped = gotMapped;
    this.isInScope = function (e) {
        return e.RoleName.match(/^modav\.sync/);
    };
};

RoleWriterSyncer.prototype.syncInlinePolicies = function (role, want, got) {
    var t = this;
    var sync = SyncEngine.sync(
        want,
        got,
        function (p) { return p.PolicyName; },
        deepEqual
    );

    return Q.all([
        Q.all(sync.create.map(function (p) {
            return AwsDataUtils.collectFromAws(t.iam, "putRolePolicy", {
                RoleName: role.RoleName,
                PolicyName: p.PolicyName,
                PolicyDocument: JSON.stringify(p.PolicyDocument),
            });
        })),
        Q.all(sync.update.map(function (p) {
            return AwsDataUtils.collectFromAws(t.iam, "putRolePolicy", {
                RoleName: role.RoleName,
                PolicyName: p.want.PolicyName,
                PolicyDocument: JSON.stringify(p.want.PolicyDocument),
            });
        })),
        Q.all(sync.delete.map(function (p) {
            return AwsDataUtils.collectFromAws(t.iam, "deleteRolePolicy", {
                RoleName: role.RoleName,
                PolicyName: p.PolicyName,
            });
        })),
    ]);
};

RoleWriterSyncer.prototype.syncAttachedPolicies = function (role, want, got) {
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
            return AwsDataUtils.collectFromAws(t.iam, "attachRolePolicy", {
                RoleName: role.RoleName,
                PolicyArn: arn,
            });
        })),
        Q.all(sync.update.map(function (p) {
            return AwsDataUtils.collectFromAws(t.iam, "attachRolePolicy", {
                RoleName: role.RoleName,
                PolicyArn: t.gotMapped.PolicyMap[p.PolicyName].Arn,
            });
        })),
        Q.all(sync.delete.map(function (p) {
            return AwsDataUtils.collectFromAws(t.iam, "detachRolePolicy", {
                RoleName: role.RoleName,
                PolicyArn: p.PolicyArn,
            });
        })),
    ]);
};

RoleWriterSyncer.prototype.doCreate = function (want) {
    var t = this;
    if (!this.isInScope(want)) {
        throw "Refusing to create out-of-scope role " + JSON.stringify(want);
    }

    console.log("Create role", CanonicalJson(want, null, 2));
    if (this.config.dryRun) return;

    return AwsDataUtils.collectFromAws(this.iam, "createRole", {
        RoleName: want.RoleName,
        Path: want.Path,
        AssumeRolePolicyDocument: JSON.stringify(want.AssumeRolePolicyDocument),
    }).then(function (r) {
        t.gotMapped.RoleDetailMap[r.Role.RoleName] = r.Role;
        return Q.all([
            Q(t).invoke("syncInlinePolicies", want, want.RolePolicyList, []),
            Q(t).invoke("syncAttachedPolicies", want, want.AttachedManagedPolicies, [])
        ]);
    });
};

RoleWriterSyncer.prototype.doCreates = function () {
    return this.invokeForEach("doCreate", this.syncOps.create);
};

RoleWriterSyncer.prototype.doUpdate = function (e) {
    var t = this;

    if (!this.isInScope(e.got)) {
        throw "Refusing to update out-of-scope role " + JSON.stringify(e.got);
    }

    console.log("Update role", CanonicalJson(e, null, 2));
    if (this.config.dryRun) return;

    if (e.want.Path != e.got.Path || !deepEqual(e.want.AssumeRolePolicyDocument, JSON.parse(decodeURIComponent(e.got.AssumeRolePolicyDocument)))) {
        return t.doDelete(e.got).then(function () { return t.doCreate(e.want); });
    }

    return Q.all([
        Q(t).invoke("syncInlinePolicies", e.want, e.want.RolePolicyList, e.got.RolePolicyList),
        Q(t).invoke("syncAttachedPolicies", e.want, e.want.AttachedManagedPolicies, e.got.AttachedManagedPolicies),
    ]);
};

RoleWriterSyncer.prototype.doUpdates = function () {
    return this.invokeForEach("doUpdate", this.syncOps.update);
};

RoleWriterSyncer.prototype.doCreatesUpdates = function () {
    return Q.all([
        Q(this).invoke("doCreates"),
        Q(this).invoke("doUpdates"),
    ]);
};

RoleWriterSyncer.prototype.doDelete = function (got) {
    var t = this;
    if (!this.isInScope(got)) return;

    console.log("Delete role", CanonicalJson(got, null, 2));
    if (this.config.dryRun) return;

    return this.syncAttachedPolicies(got, [], got.AttachedManagedPolicies)
        .then(function () {
            return AwsDataUtils.collectFromAws(t.iam, "deleteRole", { RoleName: got.RoleName });
        });
};

RoleWriterSyncer.prototype.doDeletes = function () {
    return this.invokeForEach("doDelete", this.syncOps.delete);
};

RoleWriterSyncer.prototype.invokeForEach = function (method, list) {
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
        gotMapped.RoleDetailList,
        function (e) { return e.RoleName; },
        function (w, g) {
            return w.RoleName === g.RoleName &&
                w.Path === g.Path &&
                deepEqual(w.AssumeRolePolicyDocument, JSON.parse(decodeURIComponent(g.AssumeRolePolicyDocument))) &&
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

    return new RoleWriterSyncer(config, iam, syncOps, gotMapped);
};

module.exports = {
    sync: sync,
};
