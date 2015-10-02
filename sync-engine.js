var makeMap = function (keys) {
    return keys.reduce(function (p, k) {
        p[k] = true;
        return p;
    }, {});
};

var sync = function (want, got, wantKeyFunc, gotKeyFunc) {

    var wantKeys = makeMap(want);
    var gotKeys = makeMap(got);

    var ans = {
        create: [],
        update: [],
        delete: []
    };

    ans.create = Object.keys(wantKeys)
        .filter(function (k) { return !gotKeys[k]; })
        .sort();
    ans.delete = Object.keys(gotKeys)
        .filter(function (k) { return !wantKeys[k]; })
        .sort();

    return ans;
};

module.exports = {
    sync: sync
};
