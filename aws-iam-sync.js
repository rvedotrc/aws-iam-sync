var Q = require('q');

var ConsistencyChecker = require('./consistency-checker');
var IAMCollector = require('./iam-collector');
var DryRunIAM = require('./dry-run-iam');
var PolicyLoader = require('./policy-loader');
var PolicyWriter = require('./policy-writer');
var RolesLoader = require('./roles-loader');
var RolesWriter = require('./roles-writer');
var UsersLoader = require('./users-loader');
var UsersWriter = require('./users-writer');
var GroupsLoader = require('./groups-loader');
var GroupsWriter = require('./groups-writer');

var config = require('./options-parser').parse(process.argv);

var wantedRoles = Q(true).then(RolesLoader.getWanted);
var wantedPolicies = Q(true).then(PolicyLoader.getWanted);
var wantedUsers = Q(true).then(UsersLoader.getWanted);
var wantedGroups = Q(true).then(GroupsLoader.getWanted);

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

        var doWrites = function () {
            var addPolicies = policySyncer.invoke("doCreatesUpdates");
            var addRoles = Q(true);
            var addUsers = Q(true);
            var addGroups = Q(true);
//             var addPolicies = Q.all([ iam, wantedPolicies, gotMapped ]).spread(PolicyWriter.doCreateUpdate);
//             var addRoles = addPolicies.then(function () {
//                 return Q.all([ iam, wantedRoles, gotMapped ]).spread(RolesWriter.doCreateUpdate);
//             });
//             var addGroups = addPolicies.then(function () {
//                 return Q.all([ iam, wantedGroups, gotMapped ]).spread(GroupsWriter.doCreateUpdate);
//             });
//             var addUsers = Q.all([ addPolicies, addGroups ]).then(function () {
//                 return Q.all([ iam, wantedUsers, gotMapped ]).spread(UsersWriter.doCreateUpdate);
//             });
// 
            return Q.all([ addPolicies, addRoles, addGroups, addUsers ]);
        };

        var doCleanup = function () {
            var delUsers = Q(true);
            var delGroups = Q(true);
            var delRoles = Q(true);
//             var delUsers = Q.all([ iam, wantedUsers, gotMapped ]).spread(UsersWriter.doDelete);
//             var delGroups = delUsers.then(function () {
//                 return Q.all([ iam, wantedGroups, gotMapped ]).spread(GroupsWriter.doDelete);
//             });
//             var delRoles = Q.all([ iam, wantedRoles, gotMapped ]).spread(RolesWriter.doDelete);
            var delPolicies = Q.all([ delRoles, delUsers, delGroups ]).then(function () {
                return policySyncer.invoke("doDeletes");
            });

            return Q.all([ delPolicies, delRoles, delGroups, delUsers ]);
        };

        return Q(true).then(doWrites).then(doCleanup);
    })
    .done();

