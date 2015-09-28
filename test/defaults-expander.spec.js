var assert = require("assert");
require("should");

var DefaultsExpander = require("../defaults-expander");

describe("DefaultsExpander", function () {

    it('passes simple list unmodified', function () {
        var i = [
            { a:1, b:2 },
            { a:3, b:4 }
        ];
        var o = DefaultsExpander.expand(i);
        assert.deepEqual(i, o);
    });

    it('applies a default to a list', function () {
        var i = {
            defaults: { c:7 },
            apply_to: [
                { a:1, b:2 },
                { a:3, b:4, c:5 }
            ]
        };
        var o = DefaultsExpander.expand(i);
        var e = [
            { a:1, b:2, c:7 },
            { a:3, b:4, c:5 }
        ];
        assert.deepEqual(e, o);
    });

});

