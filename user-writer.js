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
        return scopeChecker.isUserInScope(e);
    };
};

Syncer.prototype.syncGroups = function (user, want, got, skipDryRun) {
    var t = this;
    var sync = SyncEngine.sync(
        want,
        got
    );

    return Q.all([
        Q.all(sync.create.map(function (g) {
            if (!skipDryRun) {
                console.log("addUserToGroup", user.UserName, g);
                if (t.config.dryRun) return;
            }
            return AwsDataUtils.collectFromAws(t.iam, "addUserToGroup", {
                UserName: user.UserName,
                GroupName: g
            });
        })),
        Q.all(sync.delete.map(function (g) {
            if (!skipDryRun) {
                console.log("removeUserFromGroup", user.UserName, g);
                if (t.config.dryRun) return;
            }
            return AwsDataUtils.collectFromAws(t.iam, "removeUserFromGroup", {
                UserName: user.UserName,
                GroupName: g
            });
        })),
    ]);
};

Syncer.prototype.syncInlinePolicies = function (user, want, got, skipDryRun) {
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
                console.log("putUserPolicy (create)", user.UserName, p.PolicyName);
                if (t.config.dryRun) return;
            }
            return AwsDataUtils.collectFromAws(t.iam, "putUserPolicy", {
                UserName: user.UserName,
                PolicyName: p.PolicyName,
                PolicyDocument: JSON.stringify(p.PolicyDocument),
            });
        })),
        Q.all(sync.update.map(function (p) {
            if (!skipDryRun) {
                console.log("putUserPolicy (update)", user.UserName, p.want.PolicyName);
                console.log("  got:  " + JSON.stringify(p.got));
                console.log("  want: " + JSON.stringify(p.want));
                if (t.config.dryRun) return;
            }
            return AwsDataUtils.collectFromAws(t.iam, "putUserPolicy", {
                UserName: user.UserName,
                PolicyName: p.want.PolicyName,
                PolicyDocument: JSON.stringify(p.want.PolicyDocument),
            });
        })),
        Q.all(sync.delete.map(function (p) {
            if (!skipDryRun) {
                console.log("deleteUserPolicy", user.UserName, p.PolicyName);
                if (t.config.dryRun) return;
            }
            return AwsDataUtils.collectFromAws(t.iam, "deleteUserPolicy", {
                UserName: user.UserName,
                PolicyName: p.PolicyName,
            }).fail(AwsDataUtils.swallowError('NoSuchEntity'));
        })),
    ]);
};

Syncer.prototype.syncAttachedPolicies = function (user, want, got, skipDryRun) {
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
                console.log("attachUserPolicy", user.UserName, p.PolicyName);
                if (t.config.dryRun) return;
            }
            return AwsDataUtils.collectFromAws(t.iam, "attachUserPolicy", {
                UserName: user.UserName,
                PolicyArn: arn,
            });
        })),
        Q.all(sync.delete.map(function (p) {
            if (!skipDryRun) {
                console.log("detachUserPolicy", user.UserName, p.PolicyName);
                if (t.config.dryRun) return;
            }
            return AwsDataUtils.collectFromAws(t.iam, "detachUserPolicy", {
                UserName: user.UserName,
                PolicyArn: p.PolicyArn,
            }).fail(AwsDataUtils.swallowError('NoSuchEntity'));
        })),
    ]);
};

Syncer.prototype.doCreate = function (want) {
    var t = this;
    if (!this.isInScope(want)) {
        throw "Refusing to create out-of-scope user " + JSON.stringify(want);
    }

    console.log("Create user", want.UserName, CanonicalJson(want, null, 2));
    if (this.config.dryRun) return;

    return AwsDataUtils.collectFromAws(this.iam, "createUser", {
        UserName: want.UserName,
        Path: want.Path,
    }).then(function (r) {
        t.gotMapped.UserDetailMap[r.User.UserName] = r.User;
        return Q.all([
            Q(t).invoke("syncGroups", want, want.GroupList, [], true),
            Q(t).invoke("syncInlinePolicies", want, want.UserPolicyList, [], true),
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
        throw "Refusing to update out-of-scope user " + JSON.stringify(e.got);
    }

    var base = Q(true);

    if (e.want.Path != e.got.Path) {
        console.log("Update user", e.got.UserName, e.got.Path, e.want.Path);
        if (!t.config.dryRun) {
            base = AwsDataUtils.collectFromAws(t.iam, "updateUser", {
                UserName: e.got.UserName,
                NewPath: e.want.Path,
            });
        }
    }

    return base.then(function () {
        return Q.all([
            Q(t).invoke("syncGroups", e.want, e.want.GroupList, e.got.GroupList),
            Q(t).invoke("syncInlinePolicies", e.want, e.want.UserPolicyList, e.got.UserPolicyList),
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

Syncer.prototype.deleteCredentials = function (got) {
    var t = this;

    var deleteAccessKeys = AwsDataUtils.collectFromAws(t.iam, "listAccessKeys", { UserName: got.UserName })
        .then(function (r) {
            return Q.all(
                r.AccessKeyMetadata.map(function (m) {
                    return AwsDataUtils.collectFromAws(t.iam, "deleteAccessKey", { UserName: m.UserName, AccessKeyId: m.AccessKeyId });
                })
            );
        }, AwsDataUtils.swallowError('NoSuchEntity'));

    var deleteLoginProfile = AwsDataUtils.collectFromAws(t.iam, "deleteLoginProfile", { UserName: got.UserName })
        .fail(AwsDataUtils.swallowError('NoSuchEntity'));

    var deactivateMFADevices = AwsDataUtils.collectFromAws(t.iam, "listMFADevices", { UserName: got.UserName })
        .then(function (r) {
            return Q.all(
                r.MFADevices.map(function (mfa) {
                    // mfa.UserName, mfa.SerialNumber, mfa.EnableDate
                    return AwsDataUtils.collectFromAws(t.iam, "deactivateMFADevice", { UserName: mfa.UserName, SerialNumber: mfa.SerialNumber })
                        .then(function (v) {
                            return AwsDataUtils.collectFromAws(t.iam, "deleteVirtualMFADevice", { SerialNumber: mfa.SerialNumber });
                        });
                })
            );
        });

    var deleteSSHPublicKeys = AwsDataUtils.collectFromAws(t.iam, "listSSHPublicKeys", { UserName: got.UserName })
        .then(function (r) {
            return Q.all(
                r.SSHPublicKeys.map(function (ssh) {
                    // ssh.UserName, ssh.SSHPublicKeyId, // ssh.Status, ssh.UploadDate
                    return AwsDataUtils.collectFromAws(t.iam, "deleteSSHPublicKey", { UserName: ssh.UserName, SSHPublicKeyId: ssh.SSHPublicKeyId });
                })
            );
        });

    // TODO other access methods
    return Q.all([
        deleteAccessKeys,
        deleteLoginProfile,
        deactivateMFADevices,
        deleteSSHPublicKeys,
    ]);

    // FIXME: it takes a few seconds after a "delete" for the "deleteConflict" error not to happen.
    // So even once this promise is done, deleting a user may still fail.
};

Syncer.prototype.doDelete = function (got) {
    var t = this;
    if (!this.isInScope(got)) return;

    console.log("Delete user", got.UserName, CanonicalJson(got, null, 2));
    if (this.config.dryRun) return;

    return Q.all([
        this.syncGroups(got, [], got.GroupList, true),
        this.syncAttachedPolicies(got, [], got.AttachedManagedPolicies, true),
        this.syncInlinePolicies(got, [], got.UserPolicyList, true),
    ])
    .then(this.deleteCredentials(got))
    .then(function () {
        return AwsDataUtils.collectFromAws(t.iam, "deleteUser", { UserName: got.UserName })
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
        wanted.UserDetailList,
        gotMapped.UserDetailList,
        function (e) { return e.UserName.toUpperCase(); },
        function (w, g) {
            return w.UserName.toUpperCase() === g.UserName.toUpperCase() &&
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

    return new Syncer(config, iam, syncOps, gotMapped, scopeChecker);
};

module.exports = {
    sync: sync,
};
