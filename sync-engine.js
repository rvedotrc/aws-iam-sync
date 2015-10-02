var makeMap = function (list, keyFunc) {
    return list.reduce(function (p, ele) {
        p[ keyFunc ? keyFunc(ele) : ele ] = ele;
        return p;
    }, {});
};

var sync = function (want, got, keyFunc) {

    var wantKeys = makeMap(want, keyFunc);
    var gotKeys = makeMap(got, keyFunc);

    var ans = {
        create: [],
        update: [],
        delete: []
    };

    ans.create = Object.keys(wantKeys)
        .filter(function (k) { return !Object.hasOwnProperty.apply(gotKeys, [k]); })
        .sort()
        .map(function (k) { return wantKeys[k]; });

    ans.delete = Object.keys(gotKeys)
        .filter(function (k) { return !Object.hasOwnProperty.apply(wantKeys, [k]); })
        .sort()
        .map(function (k) { return gotKeys[k]; });

    return ans;
};

module.exports = {
    sync: sync
};
