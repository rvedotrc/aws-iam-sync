var parse = function (args) {
    var program = require('commander');
    program
        .version('0.0.1')
        .option('-n, --dry-run')
        .parse(args);
    return program;
};

module.exports = {
    parse: parse,
};
