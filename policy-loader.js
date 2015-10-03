var Q = require('q');
var fs = require('fs');

var loadPolicyFile = function (filename) {
    return Q.nfcall(fs.readFile, "wanted/policies/"+filename)
        .then(function (content) {
            return {
                PolicyName: policyFilenameToPolicyName(filename),
                Path: "/",
                PolicyDocument: JSON.parse(content),
                Description: ""
            };
        });
};

var policyFilenameToPolicyName = function (n) {
    return "modav." + n.replace(".json", "");
};

var getWanted = function () {
    return Q.nfcall(fs.readdir, "wanted/policies")
        .then(function (names) {
            return Q.all(
                names.sort().map(loadPolicyFile)
            );
        });
};

module.exports = {
    getWanted: getWanted
};
