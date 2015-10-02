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

    var ans = {
        create: [],
        noop: [],
        update: []
    };

    Object.keys(wantMap)
        .sort()
        .map(function (k) {
            if (!Object.hasOwnProperty.apply(gotMap, [k])) {
                ans.create.push( wantMap[k] );
            } else {
                var w = wantMap[k];
                var g = gotMap[k];
                if (equal(w, g, equalFunc)) {
                    ans.noop.push( { want: w, got: g } );
                } else {
                    ans.update.push( { want: w, got: g } );
                }
            }
        });

    ans.delete = Object.keys(gotMap)
        .filter(function (k) { return !Object.hasOwnProperty.apply(wantMap, [k]); })
        .sort()
        .map(function (k) { return gotMap[k]; });

    return ans;
};

module.exports = {
    sync: sync
};
