var Q = require('q');
var fs = require('fs');
var merge = require('merge');
var uniq = require('uniq');

var DefaultsExander = require('./defaults-expander');

var loadRolesFile = function (filename) {
    return Q.nfcall(fs.readFile, "wanted/roles/"+filename)
        .then(function (content) {
            return DefaultsExander.expand(JSON.parse(content));
        });
};

var mergeRoles = function (a, b) {
    if (a.name != b.name) {
        throw "name mismatch for " + a.name + " and " + b.name;
    }
    if (a.path != b.path) {
        throw "path mismatch for " + a.name;
    }

    var policies = (a.policies || []).concat(b.policies || []);
    policies = uniq(policies.sort());

    return merge(true, a, { policies: policies });
};

var mergeRolesLists = function (rolesLists) {
    var o = {};
    rolesLists.map(function (l) {
        l.map(function (r) {
            var got = o[ r.name ];
            if (!got) {
                o[ r.name ] = r;
            } else {
                o[ r.name ] = mergeRoles(got, r);
            }
        });
    });
    return o;
};

var getWanted = function () {
    return Q.nfcall(fs.readdir, "wanted/roles")
        .then(function (names) {
            return Q.all(
                names.map(loadRolesFile)
            ).then(mergeRolesLists);
        });
};

module.exports = {
    getWanted: getWanted
};
