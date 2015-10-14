var parse = function (args) {
    var program = require('commander');
    program
        .version('0.0.1')
        .option('-n, --dry-run', "Don't actually apply any changes")
        .option('-w, --wanted-file <file>', "Specify the 'wanted' file")
        .option('-s, --scope-file <file>', "Specify the 'scope' file")
        .option('--save-state <file>', "After discovering all existing assets via IAM, save to this file")
        .option('--load-state <file>', "Load assets from this file instead of reading from IAM")
        .parse(args);
    return program;
};

module.exports = {
    parse: parse,
};
