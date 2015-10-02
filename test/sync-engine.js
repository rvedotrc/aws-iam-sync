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

});
