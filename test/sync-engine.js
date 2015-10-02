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
            function (o) { return o.UserName; }
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

});
