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
    return AwsDataUtils.collectFromAws(client, "getAccountAuthorizationDetails", {}, paginationHelper);
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
