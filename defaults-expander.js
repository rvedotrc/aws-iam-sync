var merge = require('merge');

var expand = function (d, defaults) {
    if (d.defaults && d.apply_to) {
        return d.apply_to.map(function (e) {
            return merge(true, d.defaults, e);
        });
    }

    return d;
};

module.exports = {
    expand: expand
};
