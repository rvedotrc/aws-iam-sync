var Q = require('q');
var fs = require('fs');

var dir = 'wanted/policies';

var isGoodFilename = function (filename) {
    return filename.match(/^\w+\.json$/);
};

var loadPolicyFile = function (filename) {
    return Q.nfcall(fs.readFile, dir+"/"+filename)
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
    return Q.nfcall(fs.readdir, dir)
        .then(function (names) {
            return Q.all(
                names.filter(isGoodFilename).sort().map(loadPolicyFile)
            );
        });
};

module.exports = {
    dir: dir,
    getWanted: getWanted
};
