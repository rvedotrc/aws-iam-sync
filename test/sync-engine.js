var assert = require("assert");
require("should");

var SyncEngine = require("../sync-engine");

describe('SyncEngine', function () {

    it('syncs strings', function () {

        var ans = SyncEngine.sync(
            [ "words", "at", "random" ],
            [ "more", "words" ]
        );

        assert.deepEqual(
            ans,
            {
                create: [ "at", "random" ],
                update: [],
                delete: [ "more" ]
            }
        );

    });

    it('syncs lists of objects', function () {
        var ans = SyncEngine.sync(
            [
                { UserName: 'alice' },
                { UserName: 'bob' }
            ], [
                { UserName: 'bob' },
                { UserName: 'flea' }
            ],
            function (o) { return o.UserName; },
            function (x, y) { return true; }
        );

        assert.deepEqual(
            ans,
            {
                create: [ { UserName: 'alice' } ],
                update: [],
                delete: [ { UserName: 'flea' } ]
            }
        );
    });

    it('detects updates', function () {
        var ans = SyncEngine.sync(
            [
                { UserName: 'alice', Age: 12, Id: 36435 },
                { UserName: 'bob', Age: 3, Id: 123 }
            ], [
                { UserName: 'alice', Age: 11, Id: 36435 },
                { UserName: 'bob', Age: 3, Id: 987 }
            ],
            function (o) { return o.UserName; },
            function (x, y) { return(x.Age === y.Age); }
        );

        assert.deepEqual(
            ans,
            {
                create: [],
                update: [
                    {
                        want: { UserName: 'alice', Age: 12, Id: 36435 },
                        got: { UserName: 'alice', Age: 11, Id: 36435 }
                    }
                ],
                delete: []
            }
        );
    });

});
