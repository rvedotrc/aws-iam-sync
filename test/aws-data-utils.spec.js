var assert = require("assert");
require("should");
var sinon = require("sinon");

var AwsDataUtils = require("../aws-data-utils");

describe("AwsDataUtils", function () {

    var sandbox;

    beforeEach(function () {
        sandbox = sinon.sandbox.create();
    });

    afterEach(function () {
        sandbox.restore();
    });

    it('returns a promise to fetch data from AWS', function (mochaDone) {
        var expectedData = { Things: [ { "ThingName": "bob", "ThingId": "xxx" } ] };

        var anAwsClient = {
            serviceIdentifier: "Thing",
            config: {},
            getThings: function (args, cb) {
                args.should.eql({"ThingName": "bob"});
                cb(null, expectedData);
            }
        };

        AwsDataUtils.collectFromAws(anAwsClient, "getThings", {"ThingName": "bob"})
            .then(function (actualData) {
                assert.deepEqual(expectedData, actualData);
                mochaDone();
            }).done();
    });

    it('fails if the result seems to be truncated but no paginationHelper is provided', function (mochaDone) {
        var anAwsClient = {
            serviceIdentifier: "Thing",
            config: {},
            getThings: function (args, cb) {
                cb(null, { Things: [], Marker: "more!" });
            }
        };

        AwsDataUtils.collectFromAws(anAwsClient, "getThings", {})
            .fail(function (err) {
                err.should.match(/Response seems to contain pagination data, but no paginationHelper was provided/);
                mochaDone();
            }).done();
    });

    it('uses the paginationHelper to make subsequent requests', function (mochaDone) {
        var marker1 = "someMagicValue1";
        var marker2 = "someMagicValue2";

        var calledWith = [];
        var returns = [
            { Things: [], NextMarker: marker1 },
            { Things: [], NextMarker: marker2 },
            { Things: [] }
        ];

        var anAwsClient = {
            serviceIdentifier: "Thing",
            config: {},
            getThings: function (opts, cb) {
                calledWith.push(opts);
                cb(null, returns.shift());
            }
        };

        var paginationHelper = AwsDataUtils.paginationHelper("NextMarker", "Marker", "Things");
        AwsDataUtils.collectFromAws(anAwsClient, "getThings", { x: 'y' }, paginationHelper)
            .then(function (data) {
                assert.deepEqual([
                    { x: 'y' },
                    { x: 'y', Marker: marker1 },
                    { x: 'y', Marker: marker2 }
                ], calledWith);
                mochaDone();
            }).done();
    });

    it('uses the paginationHelper to join results', function (mochaDone) {
        var marker1 = "someMagicValue1";
        var marker2 = "someMagicValue2";

        var calledWith = [];
        var returns = [
            { Things: [1,2,3], NextMarker: marker1 },
            { Things: [4,5,6], NextMarker: marker2 },
            { Things: [7,8,9] }
        ];

        var anAwsClient = {
            serviceIdentifier: "Thing",
            config: {},
            getThings: function (opts, cb) {
                calledWith.push(opts);
                cb(null, returns.shift());
            }
        };

        var paginationHelper = AwsDataUtils.paginationHelper("NextMarker", "Marker", "Things");
        AwsDataUtils.collectFromAws(anAwsClient, "getThings", {}, paginationHelper)
            .then(function (data) {
                assert.deepEqual([1,2,3,4,5,6,7,8,9], data.Things);
                mochaDone();
            }).done();
    });

    it('tries again on Throttling error', function (mochaDone) {
        var anAwsClient = {
            serviceIdentifier: "Thing",
            config: {},
            getThings: function () {}
        };

        var mock = sandbox.mock(anAwsClient);
        mock.expects("getThings").twice()
            .onFirstCall().yields({ code: 'Throttling' }, null)
            .onSecondCall().yields(null, { Things: [] });

        sandbox.mock(AwsDataUtils).expects("getDelay").once().returns(5);

        AwsDataUtils.collectFromAws(anAwsClient, "getThings", {})
            .then(function (data) {
                mock.verify();
                mochaDone();
            }).done();
    });

    it('does not try again on non-Throttling error', function (mochaDone) {
        var thrown = { code: 'Denied' };

        var anAwsClient = {
            serviceIdentifier: "Thing",
            config: {},
            getThings: function () {}
        };

        var mock = sandbox.mock(anAwsClient);
        mock.expects("getThings").once().onFirstCall().yields(thrown, null);

        sandbox.mock(AwsDataUtils).expects("getDelay").once().returns(50);

        AwsDataUtils.collectFromAws(anAwsClient, "getThings", {})
            .fail(function (caught) {
                assert.deepEqual(thrown, caught);
                mock.verify();
                mochaDone();
            }).done();
    });

});
