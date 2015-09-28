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

        var addRoles = Q.all([ iam, wantedPolicies, gotMapped ]).spread(PolicyWriter.doCreateUpdate);

        return addRoles
            .then(function () {
                return Q.all([ iam, wantedPolicies, gotMapped ]).spread(PolicyWriter.doDelete);
            });
    })
    .done();

