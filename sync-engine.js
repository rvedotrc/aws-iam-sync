var makeMap = function (list, idFunc) {
    return list.reduce(function (p, ele) {
        var key = idFunc ? idFunc(ele) : ele;
        if (Object.hasOwnProperty.apply(p, [key])) {
            throw "Duplicate ID '"+key+"' detected in got/want list";
        }
        p[key] = ele;
        return p;
    }, {});
};

var equal = function (x, y, equalFunc) {
    return(equalFunc ? equalFunc(x, y) : (x === y));
};

var sync = function (want, got, idFunc, equalFunc) {

    var wantMap = makeMap(want, idFunc);
    var gotMap = makeMap(got, idFunc);

    var ans = {};

    ans.create = Object.keys(wantMap)
        .filter(function (k) { return !Object.hasOwnProperty.apply(gotMap, [k]); })
        .sort()
        .map(function (k) { return wantMap[k]; });

    ans.delete = Object.keys(gotMap)
        .filter(function (k) { return !Object.hasOwnProperty.apply(wantMap, [k]); })
        .sort()
        .map(function (k) { return gotMap[k]; });

    ans.update = Object.keys(wantMap)
        .filter(function (k) { return Object.hasOwnProperty.apply(gotMap, [k]); })
        .filter(function (k) { return !equal(gotMap[k], wantMap[k], equalFunc);  })
        .sort()
        .map(function (k) { return { got: gotMap[k], want: wantMap[k] }; });

    return ans;
};

module.exports = {
    sync: sync
};
