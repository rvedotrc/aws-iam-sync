var Q = require('q');
var assert = require('assert');
var fs = require('fs');
var sinon = require('sinon');

var PolicyLoader = require('../policy-loader');

describe('PolicyLoader', function () {

    var sandbox;

    beforeEach(function () {
        sandbox = sinon.sandbox.create();
    });

    afterEach(function () {
        sandbox.restore();
    });

    it('loads from an empty directory', function (mochaDone) {
        var stub = sinon.stub(fs, "readdir").withArgs('wanted/policies').yields(null, []);
        PolicyLoader.getWanted()
            .then(function (ans) {
                assert.deepEqual(ans, []);
                mochaDone();
            })
            .done();
    });

});
