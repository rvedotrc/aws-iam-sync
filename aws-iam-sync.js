var Q = require('q');

var ConsistencyChecker = require('./consistency-checker');
var IAMCollector = require('./iam-collector');
var DryRunIAM = require('./dry-run-iam');
var PolicyLoader = require('./policy-loader');
var PolicyWriter = require('./policy-writer');
var RolesLoader = require('./roles-loader');
var RolesWriter = require('./roles-writer');
var UsersWriter = require('./users-writer');
var GroupsWriter = require('./groups-writer');

var wantedRoles = Q(true).then(RolesLoader.getWanted);
var wantedPolicies = Q(true).then(PolicyLoader.getWanted);
var wantedUsers = Q(null);
var wantedGroups = Q(null);

Q.all([ wantedRoles, wantedPolicies, wantedUsers, wantedGroups ])
    .spread(ConsistencyChecker.checkConsistency)
    .then(function () {

        var iam = Q(true).then(IAMCollector.getIAM);

        // Eww, nasty dry run logic!
        iam = iam.then(function (c) { return DryRunIAM.wrap(c); });

        var gotMapped = iam
            .then(IAMCollector.getAccountAuthorizationDetails)
            .then(IAMCollector.mapAccountAuthorizationDetails);

        var doWrites = function () {
            var addPolicies = Q.all([ iam, wantedPolicies, gotMapped ]).spread(PolicyWriter.doCreateUpdate);
            var addRoles = addPolicies.then(function () {
                return Q.all([ iam, wantedRoles, gotMapped ]).spread(RolesWriter.doCreateUpdate);
            });
            var addGroups = addPolicies.then(function () {
                return Q.all([ iam, wantedGroups, gotMapped ]).spread(GroupsWriter.doCreateUpdate);
            });
            var addUsers = Q.all([ addPolicies, addGroups ]).then(function () {
                return Q.all([ iam, wantedUsers, gotMapped ]).spread(UsersWriter.doCreateUpdate);
            });

            return Q.all([ addPolicies, addRoles, addGroups, addUsers ]);
        };

        var doCleanup = function () {
            var delUsers = Q.all([ iam, wantedUsers, gotMapped ]).spread(UsersWriter.doDelete);
            var delGroups = delUsers.then(function () {
                return Q.all([ iam, wantedGroups, gotMapped ]).spread(GroupsWriter.doDelete);
            });
            var delRoles = Q.all([ iam, wantedRoles, gotMapped ]).spread(RolesWriter.doDelete);
            var delPolicies = Q.all([ delRoles, delUsers, delGroups ]).then(function () {
                return Q.all([ iam, wantedPolicies, gotMapped ]).spread(PolicyWriter.doDelete);
            });

            return Q.all([ delPolicies, delRoles, delGroups, delUsers ]);
        };

        return Q(true).then(doWrites).then(doCleanup);
    })
    .done();

