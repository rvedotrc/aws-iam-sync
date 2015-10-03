var Q = require('q');
var assert = require('assert');
var fs = require('fs');
var sinon = require('sinon');

var PolicyLoader = require('../policy-loader');
var dir = PolicyLoader.dir;

describe('PolicyLoader', function () {

    var sandbox;

    beforeEach(function () {
        sandbox = sinon.sandbox.create();
    });

    afterEach(function () {
        sandbox.restore();
    });

    it('loads from an empty directory', function (mochaDone) {
        sandbox.stub(fs, "readdir").withArgs(dir).yields(null, []);
        PolicyLoader.getWanted()
            .then(function (ans) {
                assert.deepEqual(ans, []);
                mochaDone();
            })
            .done();
    });

    it('loads policies', function (mochaDone) {
        sandbox.stub(fs, "readdir").withArgs(dir).yields(null, ['b.json', 'a.json']);

        var docA = { Statement: ["go", "here"], Version: "2012-10-17" };
        sandbox.stub(fs, 'readFile').withArgs(dir+'/a.json').yields(null, JSON.stringify(docA));
        var expectedA = {
            PolicyName: "modav.a",
            Path: "/",
            Description: "",
            PolicyDocument: docA
        };

        var docB = { Statement: ["and", "here"], Version: "2012-10-17" };
        fs.readFile.withArgs(dir+'/b.json').yields(null, JSON.stringify(docB));
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

    it('ignores things that are not called something.json', function (mochaDone) {
        sandbox.stub(fs, 'readFile').throws();

        sandbox.stub(fs, "readdir").withArgs(dir).yields(null, ['a.txt', 'some-thing.json']);

        PolicyLoader.getWanted()
            .then(function (ans) {
                assert.deepEqual(ans, []);
                mochaDone();
            })
            .done();
    });

});
