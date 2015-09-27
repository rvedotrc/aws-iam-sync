var Q = require('q');
var fs = require('fs');
var merge = require('merge');

var Executor = require('./executor');

var executor = new Executor(10);

var rejectIfContainsPagination = function (deferred, data) {
    var stringKeys = [];
    var arrayKeys = [];

    for (var p in data) {
        if (typeof(data[p]) === 'string') {
            stringKeys.push(p);
        } else if (Array.isArray(data[p])) {
            arrayKeys.push(p);
        }
    }

    if (arrayKeys.length === 1 && stringKeys.length === 1) {
        deferred.reject(
            "Response seems to contain pagination data, but no paginationHelper was provided." +
            " Keys are: " + Object.keys(data).sort().join(",")
        );
    }
};

var doCollectFromAws = function(nextJob, deferred, client, method, args, paginationHelper) {
    if (!args) args = {};
    console.log("collectFromAws", client.serviceIdentifier, method, args);

    var cb = function (err, data) {
        if (err === null) {
            // To collect information on which method calls return what keys,
            // particularly with regards to pagination.  The docs don't seem
            // consistent.
            var apiMeta = {
                Service: client.serviceIdentifier,
                Method: method,
                Region: client.config.region,
                RequestKeys: Object.keys(args || {}).sort(),
                ResponseKeys: Object.keys(data || {}).sort()
            };
            console.log("apiMeta =", JSON.stringify(apiMeta));

            if (paginationHelper) {
                var nextArgs = paginationHelper.nextArgs(args, data);
                if (nextArgs) {
                    var promiseOfNextData = (exports.collectFromAws)(client, method, nextArgs, paginationHelper);
                    var promiseOfJoinedData = Q.all([ Q(data), promiseOfNextData ])
                        .spread(paginationHelper.promiseOfJoinedData);
                    deferred.resolve(promiseOfJoinedData);
                }
            } else {
                rejectIfContainsPagination(deferred, data);
            }

            // Resolving a deferred twice (see above) is OK.  First wins.
            deferred.resolve(data);
        } else {
            console.log(client.serviceIdentifier, method, args, "failed with", err);

            if (err.code === 'Throttling') {
                var delay = exports.getDelay();
                console.log("Will try again in", delay, "ms");
                setTimeout(function () {
                    client[method].apply(client, [args, cb]);
                }, delay);
            } else {
                deferred.reject(err);
            }
        }
        nextJob();
    };

    client[method].apply(client, [args, cb]);
};

// How long to wait on Throttling errors.  Used for testing.
exports.getDelay = function () {
    return 1000 + Math.random() * 5000;
};

exports.collectFromAws = function (client, method, args, paginationHelper) {
    var deferred = Q.defer();
    executor.submit(doCollectFromAws, deferred, client, method, args, paginationHelper);
    return deferred.promise;
};

exports.paginationHelper = function (responseTokenField, requestTokenField, responseListField) {
    return {
        nextArgs: function (args, data) {
            if (!data[responseTokenField]) return;
            var toMerge = {};
            toMerge[requestTokenField] = data[responseTokenField];
            return merge({}, args, toMerge);
        },
        promiseOfJoinedData: function (data1, data2) {
            if (!data1[responseListField] || !data2[responseListField]) {
                console.log("data1", data1);
                console.log("data2", data2);
                throw new Error("Can't join pages - at least one of them is missing " + responseListField);
            }
            var toMerge = {};
            toMerge[responseListField] = data1[responseListField].concat(data2[responseListField]);
            return merge({}, data2, toMerge);
        }
    };
};

exports.tidyResponseMetadata = function (data) {
    if (data.ResponseMetadata) {
        delete data.ResponseMetadata.RequestId;
        if (Object.keys(data.ResponseMetadata).length === 0) {
            delete data.ResponseMetadata;
        }
    }
    if (data.IsTruncated === false) {
        delete data.IsTruncated;
    }
    return data;
};

exports.decodeJsonInline = function (key) {
    return function (data) {
        if (data[key] !== null && data[key] !== undefined) {
            data[key] = JSON.parse(data[key]);
        }
        return data;
    };
};

