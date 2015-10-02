var makeMap = function (list, keyFunc) {
    return list.reduce(function (p, ele) {
        p[ keyFunc ? keyFunc(ele) : ele ] = ele;
        return p;
    }, {});
};

var equal = function (x, y, equalFunc) {
    return(equalFunc ? equalFunc(x, y) : (x === y));
};

var sync = function (want, got, keyFunc, equalFunc) {

    var wantKeys = makeMap(want, keyFunc);
    var gotKeys = makeMap(got, keyFunc);

    var ans = {};

    ans.create = Object.keys(wantKeys)
        .filter(function (k) { return !Object.hasOwnProperty.apply(gotKeys, [k]); })
        .sort()
        .map(function (k) { return wantKeys[k]; });

    ans.delete = Object.keys(gotKeys)
        .filter(function (k) { return !Object.hasOwnProperty.apply(wantKeys, [k]); })
        .sort()
        .map(function (k) { return gotKeys[k]; });

    ans.update = Object.keys(wantKeys)
        .filter(function (k) { return Object.hasOwnProperty.apply(gotKeys, [k]); })
        .filter(function (k) { return !equal(gotKeys[k], wantKeys[k], equalFunc);  })
        .sort()
        .map(function (k) { return { got: gotKeys[k], want: wantKeys[k] }; });

    return ans;
};

module.exports = {
    sync: sync
};
