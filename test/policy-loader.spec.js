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
        var stub = sandbox.stub(fs, "readdir").withArgs('wanted/policies').yields(null, []);
        PolicyLoader.getWanted()
            .then(function (ans) {
                assert.deepEqual(ans, []);
                mochaDone();
            })
            .done();
    });

    it('loads policies', function (mochaDone) {
        var stub = sandbox.stub(fs, "readdir").withArgs('wanted/policies').yields(null, ['b.json', 'a.json']);

        var docA = { Statement: ["go", "here"], Version: "2012-10-17" };
        var stubA = sandbox.stub(fs, 'readFile').withArgs('wanted/policies/a.json').yields(null, JSON.stringify(docA));
        var expectedA = {
            PolicyName: "modav.a",
            Path: "/",
            Description: "",
            PolicyDocument: docA
        };

        var docB = { Statement: ["and", "here"], Version: "2012-10-17" };
        var stubB = stubA.withArgs('wanted/policies/b.json').yields(null, JSON.stringify(docB));
        var expectedB = {
            PolicyName: "modav.b",
            Path: "/",
            Description: "",
            PolicyDocument: docB
        };

        PolicyLoader.getWanted()
            .then(function (ans) {
                assert.deepEqual(ans, [expectedA, expectedB]);
                mochaDone();
            })
            .done();
    });

});
