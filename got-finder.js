var CanonicalJson = require('canonical-json');
var Q = require('q');
var fs = require('fs');

var IAMCollector = require('./iam-collector');

var find = function (config, iam) {
    if (config.loadState) {
        return Q.nfcall(fs.readFile, config.loadState)
            .then(function (content) {
                console.log("loaded state from", config.loadState, "instead of from IAM");
                return JSON.parse(content);
            });
    }

    var gotData = Q(iam)
        .then(IAMCollector.getAccountAuthorizationDetails)
        .then(IAMCollector.mapAccountAuthorizationDetails);

    if (config.saveState) {
        gotData = gotData.then(function (d) {
            var tmpName = config.saveState + ".tmp";
            return Q.nfcall(fs.writeFile, tmpName, CanonicalJson(d, null, 2)+"\n", { flag: 'w' })
                .then(function () { return Q.nfcall(fs.rename, tmpName, config.saveState); })
                .then(function () {
                    console.log("loaded state from IAM and saved to", config.saveState);
                    return d;
                });
        });
    }

    return gotData;
};

module.exports = {
    find: find,
};
