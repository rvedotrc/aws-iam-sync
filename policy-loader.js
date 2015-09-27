var Q = require('q');
var fs = require('fs');

var loadPolicyFile = function (filename) {
    return Q.nfcall(fs.readFile, "wanted/policies/"+filename)
        .then(function (content) {
            return {
                filename: filename,
                policy: JSON.parse(content)
            };
        });
};

var policyFilenameToPolicyName = function (n) {
    return "modav." + n.replace(".json", "");
};

var makePolicyMap = function (policyFiles) {
    return policyFiles.reduce(function (prev, curr) {
        prev[ policyFilenameToPolicyName(curr.filename) ] = curr.policy;
        return prev;
    }, {});
};

var getWanted = function () {
    return Q.nfcall(fs.readdir, "wanted/policies")
        .then(function (names) {
            return Q.all(
                names.map(loadPolicyFile)
            ).then(makePolicyMap);
        });
};

module.exports = {
    getWanted: getWanted
};
