var AWS = require('aws-sdk');
var Q = require('q');
var merge = require("merge");

var AwsDataUtils = require('./aws-data-utils');

var promiseClient = function () {
    return Q(new AWS.IAM());
};

var getAccountAuthorizationDetails = function (client) {
    var paginationHelper = {
        nextArgs: function (args, data) {
            if (!data.Marker) return;
            return merge(true, args, {Marker: data.Marker});
        },
        promiseOfJoinedData: function (data1, data2) {
            return {
                UserDetailList: data1.UserDetailList.concat(data2.UserDetailList),
                GroupDetailList: data1.GroupDetailList.concat(data2.GroupDetailList),
                RoleDetailList: data1.RoleDetailList.concat(data2.RoleDetailList),
                Policies: data1.Policies.concat(data2.Policies)
            };
        }
    };

    // Fetch each type in parallel, for speed.
    // No need to fetch AWSManagedPolicy.
    var promises = [ "User", "Role", "Group", "LocalManagedPolicy" ].map(function (t) {
        return AwsDataUtils.collectFromAws(client, "getAccountAuthorizationDetails", {Filter: [t]}, paginationHelper);
    });

    return Q.all(promises)
        .spread(function (p1, p2, p3, p4) {
            var m = paginationHelper.promiseOfJoinedData;
            return m(p1, m(p2, m(p3, p4)));
        })
        .then(decodePoliciesForAuthDetails);
};

var decodePoliciesForAuthDetails = function (l) {
    l.GroupDetailList.forEach(function (g) {
        g.GroupPolicyList.forEach(function (p) {
            p.PolicyDocument = JSON.parse(decodeURIComponent(p.PolicyDocument));
        });
    });

    l.RoleDetailList.forEach(function (r) {
        r.AssumeRolePolicyDocument = JSON.parse(decodeURIComponent(r.AssumeRolePolicyDocument));

        r.RolePolicyList.forEach(function (p) {
            p.PolicyDocument = JSON.parse(decodeURIComponent(p.PolicyDocument));
        });

        r.InstanceProfileList.forEach(function (ip) {
            // role returned within itself
            ip.Roles.forEach(function (innerRole) {
                innerRole.AssumeRolePolicyDocument = JSON.parse(decodeURIComponent(innerRole.AssumeRolePolicyDocument));
            });
        });
    });

    l.UserDetailList.forEach(function (u) {
        u.UserPolicyList.forEach(function (p) {
            p.PolicyDocument = JSON.parse(decodeURIComponent(p.PolicyDocument));
        });
    });

    l.Policies.forEach(function (p) {
        p.PolicyVersionList.forEach(function (pv) {
            pv.Document = JSON.parse(decodeURIComponent(pv.Document));
        });
    });

    return l;
};

var mapListByKey = function (list, key) {
    return list.reduce(function (h, e) {
        h[ e[key] ] = e;
        return h;
    }, {});
};

var mapAccountAuthorizationDetails = function (data) {
    data = merge(true, data);
    data.UserDetailMap = mapListByKey(data.UserDetailList, "UserName");
    data.RoleDetailMap = mapListByKey(data.RoleDetailList, "RoleName");
    data.GroupDetailMap = mapListByKey(data.GroupDetailList, "GroupName");
    data.PolicyMap = mapListByKey(data.Policies, "PolicyName");
    return data;
};

module.exports = {
    getIAM: promiseClient,
    getAccountAuthorizationDetails: getAccountAuthorizationDetails,
    mapAccountAuthorizationDetails: mapAccountAuthorizationDetails
};
