var Q = require('q');

Q.longStackSupport = true;

var ConsistencyChecker = require('./consistency-checker');
var IAMCollector = require('./iam-collector');
var GotFinder = require('./got-finder');
var DryRunIAM = require('./dry-run-iam');
var PolicyWriter = require('./policy-writer');
var RoleWriter = require('./role-writer');
var UserWriter = require('./user-writer');
var GroupWriter = require('./group-writer');

var config = require('./options-parser').parse(process.argv);
var wantedData = require(config.wantedFile);
var scopeChecker = require(config.scopeFile);

(function () {
    // e.g. https_proxy=http://host:3128
    var https_proxy = process.env.https_proxy;
    if (https_proxy) {
        var AWS = require('aws-sdk');
        var proxy = require('https-proxy-agent');
        if (!AWS.config.httpOptions) AWS.config.httpOptions = {};
        AWS.config.httpOptions.agent = proxy(https_proxy);
    }
})();

Q.all([ wantedData, scopeChecker ])
    .spread(ConsistencyChecker.checkConsistency)
    .then(function () {

        var iam = Q(true).then(IAMCollector.getIAM);

        // Eww, nasty dry run logic!
        if (config.dryRun) {
            iam = iam.then(function (c) { return DryRunIAM.wrap(c); });
        }

        var gotData = Q.all([ config, iam ]).spread(GotFinder.find);

        var policySyncer = Q.all([ config, iam, wantedData, gotData, scopeChecker ]).spread(PolicyWriter.sync);
        var roleSyncer = Q.all([ config, iam, wantedData, gotData, scopeChecker ]).spread(RoleWriter.sync);
        var groupSyncer = Q.all([ config, iam, wantedData, gotData, scopeChecker ]).spread(GroupWriter.sync);
        var userSyncer = Q.all([ config, iam, wantedData, gotData, scopeChecker ]).spread(UserWriter.sync);

        var doWrites = function () {
            var addPolicies = policySyncer.invoke("doCreatesUpdates");
            var addRoles = addPolicies.then(function () { return roleSyncer.invoke("doCreatesUpdates"); });
            var addGroups = addPolicies.then(function () { return groupSyncer.invoke("doCreatesUpdates"); });
            var addUsers = Q.all([ addPolicies, addGroups ]).then(function () { return userSyncer.invoke("doCreatesUpdates"); });

            return Q.all([ addPolicies, addRoles, addGroups, addUsers ]);
        };

        var doCleanup = function () {
            var delUsers = userSyncer.invoke("doDeletes");
            var delGroups = delUsers.then(function () { return groupSyncer.invoke("doDeletes"); });
            var delRoles = roleSyncer.invoke("doDeletes");
            var delPolicies = Q.all([ delRoles, delUsers, delGroups ]).then(function () {
                return policySyncer.invoke("doDeletes");
            });

            return Q.all([ delPolicies, delRoles, delGroups, delUsers ]);
        };

        return Q(true).then(doWrites).then(doCleanup);
    })
    .done();

