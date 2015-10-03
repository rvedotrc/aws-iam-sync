var Q = require('q');
var assert = require('assert');
var fs = require('fs');
var sinon = require('sinon');

var RolesLoader = require('../roles-loader');
var dir = RolesLoader.dir;

describe('RolesLoader', function () {

    var sandbox;

    beforeEach(function () {
        sandbox = sinon.sandbox.create();
    });

    afterEach(function () {
        sandbox.restore();
    });

    it('loads from an empty directory', function (mochaDone) {
        sandbox.stub(fs, "readdir").withArgs(dir).yields(null, []);
        RolesLoader.getWanted()
            .then(function (ans) {
                assert.deepEqual(ans, []);
                mochaDone();
            })
            .done();
    });

    it('loads roles', function (mochaDone) {
        sandbox.stub(fs, "readdir").withArgs(dir).yields(null, ['b.json', 'a.json']);

        var specA = [ { name: 'Alice', path: '/team/', policies: [ 'team' ] } ];
        sandbox.stub(fs, 'readFile').withArgs(dir+'/a.json').yields(null, JSON.stringify(specA));
        var expectedA = {
            RoleName: "Alice",
            Path: "/team/",
            AssumeRolePolicyDocument: RolesLoader.assumeLiveWormhole,
            attachedManagedPolicies: [
                { PolicyName: 'modav.team' }
            ],
        };

        var specB = [ { name: 'Bob', path: '/team/', policies: [ 'team' ] } ];
        fs.readFile.withArgs(dir+'/b.json').yields(null, JSON.stringify(specB));
        var expectedB = {
            RoleName: "Bob",
            Path: "/team/",
            AssumeRolePolicyDocument: RolesLoader.assumeLiveWormhole,
            attachedManagedPolicies: [
                { PolicyName: 'modav.team' }
            ],
        };

        RolesLoader.getWanted()
            .then(function (ans) {
                assert.deepEqual(ans, [expectedA, expectedB]);
                mochaDone();
            })
            .done();
    });

    it('ignores things that are not called something.json', function (mochaDone) {
        sandbox.stub(fs, 'readFile').throws();

        sandbox.stub(fs, "readdir").withArgs(dir).yields(null, ['a.txt', 'some-thing.json']);

        RolesLoader.getWanted()
            .then(function (ans) {
                assert.deepEqual(ans, []);
                mochaDone();
            })
            .done();
    });

});
