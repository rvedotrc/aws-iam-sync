var Q = require('q');
var assert = require('assert');
var fs = require('fs');
var sinon = require('sinon');

var RoleLoader = require('../role-loader');
var dir = RoleLoader.dir;

describe('RoleLoader', function () {

    var sandbox;

    beforeEach(function () {
        sandbox = sinon.sandbox.create();
    });

    afterEach(function () {
        sandbox.restore();
    });

    var givenFiles = function (fileMap) {
        sandbox.stub(fs, "readdir").withArgs(dir).yields(null, Object.keys(fileMap));
        var s = sandbox.stub(fs, "readFile");

        Object.keys(fileMap).map(function (filename) {
            s.withArgs(dir+'/'+filename).yields(null, JSON.stringify(fileMap[filename]));
        });
    };

    it('loads from an empty directory', function (mochaDone) {
        givenFiles({});

        RoleLoader.getWanted()
            .then(function (ans) {
                assert.deepEqual(ans, []);
                mochaDone();
            })
            .done();
    });

    it('loads roles', function (mochaDone) {
        var specA = [ { name: 'Alice', path: '/team/', policies: [ 'team' ] } ];
        var expectedA = {
            RoleName: "Alice",
            Path: "/team/",
            AssumeRolePolicyDocument: RoleLoader.assumeLiveWormhole,
            AttachedManagedPolicies: [
                { PolicyName: 'modav.team' }
            ],
            RolePolicyList: [],
        };

        var specB = [ { name: 'Bob', path: '/team/', policies: [ 'team' ] } ];
        var expectedB = {
            RoleName: "Bob",
            Path: "/team/",
            AssumeRolePolicyDocument: RoleLoader.assumeLiveWormhole,
            AttachedManagedPolicies: [
                { PolicyName: 'modav.team' }
            ],
            RolePolicyList: [],
        };

        givenFiles({
            'b.json': specB,
            'a.json': specA
        });

        RoleLoader.getWanted()
            .then(function (ans) {
                assert.deepEqual(ans, [expectedA, expectedB]);
                mochaDone();
            })
            .done();
    });

    it('ignores things that are not called something.json', function (mochaDone) {
        sandbox.stub(fs, 'readFile').throws();

        sandbox.stub(fs, "readdir").withArgs(dir).yields(null, ['a.txt', 'some-thing.json']);

        RoleLoader.getWanted()
            .then(function (ans) {
                assert.deepEqual(ans, []);
                mochaDone();
            })
            .done();
    });

    it('merges policies for each role', function (mochaDone) {
        givenFiles({
            'a.json': [
                { name: 'r1', path: '/p/', policies: [ 'x', 'y' ] }
            ],
            'b.json': [
                { name: 'r1', path: '/p/', policies: [ 'z', 'x', 'y' ] }
            ]
        });

        RoleLoader.getWanted()
            .then(function (ans) {
                assert.deepEqual(ans[0].AttachedManagedPolicies, [
                    { PolicyName: 'modav.x' },
                    { PolicyName: 'modav.y' },
                    { PolicyName: 'modav.z' }
                ]);
                mochaDone();
            })
            .done();
    });

    it('throws on path conflict for a role', function (mochaDone) {
        givenFiles({
            'a.json': [
                { name: 'r1', path: '/p1/', policies: [ 'x', 'y' ] }
            ],
            'b.json': [
                { name: 'r1', path: '/p2/', policies: [ 'z', 'x', 'y' ] }
            ]
        });

        RoleLoader.getWanted()
            .then(function (ans) {
                throw 'expected failure';
            }, function (err) {
                assert.equal(err, 'path mismatch for r1');
                mochaDone();
            })
            .done();
    });

});
