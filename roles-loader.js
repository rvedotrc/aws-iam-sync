var Q = require('q');
var fs = require('fs');
var merge = require('merge');
var uniq = require('uniq');

var DefaultsExander = require('./defaults-expander');

var dir = 'wanted/roles';

var assumeLiveWormhole = {
        "Statement": [
          {
            "Action": "sts:AssumeRole",
            "Effect": "Allow",
            "Principal": {
              "AWS": "arn:aws:iam::470820891875:role/live-aws-wormhole-resources-ComponentRole-1U534EGLBW9ZD"
            },
            "Sid": ""
          }
        ],
        "Version": "2012-10-17"
      };

var isGoodFilename = function (filename) {
    return filename.match(/^\w+\.json$/);
};

var loadRolesFile = function (filename) {
    return Q.nfcall(fs.readFile, dir+"/"+filename)
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

var transformRoles = function (map) {
    return Object.keys(map).sort().map(function (k) {
        return {
            RoleName: map[k].name,
            Path: map[k].path,
            AssumeRolePolicyDocument: assumeLiveWormhole,
            attachedManagedPolicies: map[k].policies.map(function (pn) { return { PolicyName: "modav."+pn }; })
        };
    });
};

var getWanted = function () {
    return Q.nfcall(fs.readdir, dir)
        .then(function (names) {
            return Q.all(
                names.filter(isGoodFilename).map(loadRolesFile)
            )
            .then(mergeRolesLists)
            .then(transformRoles);
        });
};

module.exports = {
    dir: dir,
    assumeLiveWormhole: assumeLiveWormhole,
    getWanted: getWanted
};
