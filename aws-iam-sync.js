var Q = require('q');

Q.longStackSupport = true;

var ConsistencyChecker = require('./consistency-checker');
var IAMCollector = require('./iam-collector');
var DryRunIAM = require('./dry-run-iam');
var PolicyLoader = require('./policy-loader');
var PolicyWriter = require('./policy-writer');
var RoleLoader = require('./role-loader');
var RoleWriter = require('./role-writer');
var UserLoader = require('./user-loader');
var UserWriter = require('./user-writer');
var GroupLoader = require('./group-loader');
var GroupWriter = require('./group-writer');

var config = require('./options-parser').parse(process.argv);

var wantedRoles = Q(true).then(RoleLoader.getWanted);
var wantedPolicies = Q(true).then(PolicyLoader.getWanted);
var wantedUsers = Q(true).then(UserLoader.getWanted);
var wantedGroups = Q(true).then(GroupLoader.getWanted);

Q.all([ wantedRoles, wantedPolicies, wantedUsers, wantedGroups ])
    .spread(ConsistencyChecker.checkConsistency)
    .then(function () {

        var iam = Q(true).then(IAMCollector.getIAM);

        // Eww, nasty dry run logic!
        if (config.dryRun) {
            iam = iam.then(function (c) { return DryRunIAM.wrap(c); });
        }

        var gotMapped = iam
            .then(IAMCollector.getAccountAuthorizationDetails)
            .then(IAMCollector.mapAccountAuthorizationDetails);

        var policySyncer = Q.all([ config, iam, wantedPolicies, gotMapped ]).spread(PolicyWriter.sync);
        var roleSyncer = Q.all([ config, iam, wantedRoles, gotMapped ]).spread(RoleWriter.sync);
        var groupSyncer = Q.all([ config, iam, wantedGroups, gotMapped ]).spread(GroupWriter.sync);
        var userSyncer = Q.all([ config, iam, wantedUsers, gotMapped ]).spread(UserWriter.sync);

        console.log(policySyncer);
        console.log(roleSyncer);
        console.log(userSyncer);
        console.log(groupSyncer);

        var doWrites = function () {
            var addPolicies = policySyncer.invoke("doCreatesUpdates");
            var addRoles = addPolicies.then(function () { return roleSyncer.invoke("doCreatesUpdates"); });
            var addGroups = addPolicies.then(function () { return groupSyncer.invoke("doCreatesUpdates"); });
            var addUsers = Q.all([ addPolicies, addGroups ]).then(function () { return roleSyncer.invoke("doCreatesUpdates"); });

            return Q.all([ addPolicies, addRoles, addGroups, addUsers ]);
        };

        var doCleanup = function () {
            var delUsers = userSyncer.invoke("doDeletes");
            var delGroups = delUsers.then(function () { return groupSyncer.invoke("doDeletes"); });
            var delRoles = roleSyncer.invoke("doDeletes");
            var delPolicies = Q.all([ delRoles, delUsers, delGroups ]).then(function () {
                return policySyncer.invoke("doDeletes");
            });

            return Q.all([ delPolicies, delRoles, delGroups, delUsers ]);
        };

        return Q(true).then(doWrites).then(doCleanup);
    })
    .done();

