var Q = require('q');

var ConsistencyChecker = require('./consistency-checker');
var IAMCollector = require('./iam-collector');
var PolicyLoader = require('./policy-loader');
var PolicyWriter = require('./policy-writer');
var RolesLoader = require('./roles-loader');

var wantedRoles = Q(true).then(RolesLoader.getWanted);
var wantedPolicies = Q(true).then(PolicyLoader.getWanted);

Q.all([ wantedRoles, wantedPolicies ])
    .spread(ConsistencyChecker.checkConsistency)
    .then(function () {

        var iam = Q(true).then(IAMCollector.getIAM);
        var got = iam.then(IAMCollector.getAccountAuthorizationDetails);
        var gotMapped = got.then(IAMCollector.mapAccountAuthorizationDetails);

        var addPolicies = Q.all([ iam, wantedPolicies, gotMapped ]).spread(PolicyWriter.doCreateUpdate);
        var addRoles = addPolicies.then(function () {
            return Q(null);
        });
        var addGroups = addPolicies.then(function () {
            return Q(null);
        });
        var addUsers = Q.all([ addPolicies, addGroups ]).then(function () {
            return Q(null);
        });

        var doWrites = Q.all([ addPolicies, addRoles, addGroups, addUsers ]);

        var doCleanup = doWrites.then(function () {
            var delRoles = Q(null);
            var delUsers = Q(null);
            var delGroups = delUsers.then(function () {
                return Q(null);
            });
            var deletePolicies = Q.all([ delRoles, delUsers, delGroups ]).then(function () {
                return Q.all([ iam, wantedPolicies, gotMapped ]).spread(PolicyWriter.doDelete);
            });

            return Q.all([ delPolicies, delRoles, delGroups, delUsers ]);
        });

        return doWrites.then(doCleanup);
    })
    .done();

