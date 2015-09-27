var Q = require('q');

var IAMCollector = require('./iam-collector');
var PolicyLoader = require('./policy-loader');
var PolicyWriter = require('./policy-writer');

var showSummary = function (existing, wanted) {
    console.log("Loaded", existing.GroupDetailList.length, "groups");
    console.log("Loaded", existing.Policies.length, "policies");
    console.log("Loaded", existing.RoleDetailList.length, "roles");
    console.log("Loaded", existing.UserDetailList.length, "users");
    console.log("Want", wanted.UserDetailList.length, "users");
};

var iam = Q(true).then(IAMCollector.getIAM);
var wanted = Q(true).then(PolicyLoader.getWanted);
var got = iam.then(IAMCollector.getAccountAuthorizationDetails);
var gotMapped = got.then(IAMCollector.mapAccountAuthorizationDetails);

var addRoles = Q.all([ iam, wanted, gotMapped ]).spread(PolicyWriter.doCreateUpdate);

return addRoles
    .then(function () {
        return Q.all([ iam, wanted, gotMapped ]).spread(PolicyWriter.doDelete);
    })
    .done();

