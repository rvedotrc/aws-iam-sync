// Given an IAM client, return a new client that passes "get" and "list"
// methods through to the first client, and replaces all other methods by a
// dummy that just succeeds.

// XXX somewhat dependent on the structure of the AWS SDK, i.e. that all the
// methods we're interested in are on the first-level prototype of the client.

var noop = function () {
    arguments[ arguments.length - 1 ](null, {});
};

var makeNoopFor = function (name) {
    return function () {
        console.log("(skipping "+name+")");
        arguments[ arguments.length - 1 ](null, {});
    };
};

var wrapByPrototype = function (realIAM) {
    var realPrototype = Object.getPrototypeOf(realIAM);

    var newPrototype = Object.create(realPrototype);

    Object.keys(realPrototype).map(function (m) {
        if (!m.match (/^(get|list)/)) {
            newPrototype[m] = noop;
        }
    });

    var wrappedIAM = Object.keys(realIAM).reduce(function (p,n) {
        p[n] = realIAM[n];
        return p;
    }, Object.create(newPrototype));

    return wrappedIAM;
};

var wrap = function (realIAM) {
    var realPrototype = Object.getPrototypeOf(realIAM);

    Object.keys(realPrototype).map(function (m) {
        if (typeof(realPrototype[m]) === 'function' && !m.match (/^(get|list)/)) {
            // console.log("nobbling method", m, "of type", typeof(realPrototype[m]));
            realPrototype[m] = makeNoopFor(m);
        }
    });

    return realIAM;
};

module.exports = {
    wrap: wrap
};

// (function () {
//     var util = require('util');
//     var AWS = require('aws-sdk');
//     var iam = new AWS.IAM();
//     var ro = module.exports.wrap(iam);
//     console.log(util.inspect(iam));
//     console.log(util.inspect(ro));
// }());
