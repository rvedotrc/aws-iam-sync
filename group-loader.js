var Q = require('q');
var fs = require('fs');
var merge = require('merge');
var uniq = require('uniq');

var DefaultsExpander = require('./defaults-expander');

var dir = 'wanted/groups';

var isGoodFilename = function (filename) {
    return filename.match(/^\w+\.json$/);
};

var loadFile = function (filename) {
    return Q.nfcall(fs.readFile, dir+"/"+filename)
        .then(function (content) {
            return DefaultsExpander.expand(JSON.parse(content));
        });
};

var mergeItems = function (a, b) {
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

var mergeFiles = function (listsOfItems) {
    var o = {};
    listsOfItems.map(function (l) {
        l.map(function (r) {
            var got = o[ r.name ];
            if (!got) {
                o[ r.name ] = r;
            } else {
                o[ r.name ] = mergeItems(got, r);
            }
        });
    });
    return o;
};

var transformItems = function (map) {
    return Object.keys(map).sort().map(function (k) {
        return {
            GroupName: map[k].name,
            Path: map[k].path,
            AttachedManagedPolicies: map[k].policies.map(function (pn) { return { PolicyName: "modav."+pn }; }),
            GroupPolicyList: [],
        };
    });
};

var getWanted = function () {
    return Q.nfcall(fs.readdir, dir)
        .then(function (names) {
            return Q.all(
                names.filter(isGoodFilename).map(loadFile)
            )
            .then(mergeFiles)
            .then(transformItems);
        });
};

module.exports = {
    dir: dir,
    getWanted: getWanted
};
