/**
* Unit tests for the Distinct-projection read path and its fallback:
* a bundle step carrying Projection { Mode: 'Distinct' } resolves via a
* distinct read, and degrades to a full record read when the server
* rejects the distinct request.
*/

const Chai = require('chai');
const Expect = Chai.expect;

const libPict = require('../source/Pict.js');

const TEST_RECORDS = [ { IDSample: 1, IDLab: 16, Name: 'A' }, { IDSample: 2, IDLab: 16, Name: 'B' } ];
const TEST_DISTINCT_RECORDS = [ { IDSample: 1 }, { IDSample: 2 } ];

/**
 * Build a stub restClient wired for the entity-provider read flow.
 *
 * @param {{ FailDistinct: boolean }} pBehavior - Whether distinct reads should fail.
 * @param {Array<string>} pRequestTrace - Receives one entry per request.
 * @return {{ getJSON: Function, postJSON: Function }} The stub client.
 */
function buildStubRestClient(pBehavior, pRequestTrace)
{
	const handleURL = (pURL, fCallback) =>
	{
		pRequestTrace.push(pURL);
		if (pURL.includes('/Schema'))
		{
			return fCallback(null, { statusCode: 404 }, { Error: 'no schema' });
		}
		if (pURL.includes('/Count'))
		{
			return fCallback(null, { statusCode: 200 }, { Count: TEST_RECORDS.length });
		}
		if (pURL.includes('/Distinct/'))
		{
			if (pBehavior.FailDistinct)
			{
				return fCallback(null, { statusCode: 404 }, { Error: 'route not found' });
			}
			return fCallback(null, { statusCode: 200 }, TEST_DISTINCT_RECORDS);
		}
		return fCallback(null, { statusCode: 200 }, TEST_RECORDS);
	};
	return {
		getJSON: (pOptionsOrURL, fCallback) =>
		{
			const tmpURL = (typeof pOptionsOrURL === 'string') ? pOptionsOrURL : pOptionsOrURL.url;
			return handleURL(tmpURL, fCallback);
		},
		postJSON: (pOptions, fCallback) =>
		{
			return handleURL(pOptions.url, fCallback);
		},
	};
}

suite(
	'Pict Entity Provider Distinct Projection',
	function()
	{
		test(
			'Distinct projection resolves through the distinct read route.',
			function(fDone)
			{
				const tmpPict = new libPict({ Product: 'DistinctFallbackTest', PictDefaultURLPrefix: 'http://localhost:1/1.0/' });
				const tmpRequestTrace = [];
				tmpPict.EntityProvider.restClient = buildStubRestClient({ FailDistinct: false }, tmpRequestTrace);
				tmpPict.EntityProvider.gatherDataFromServer(
					[
						{
							Entity: 'SampleLabJoin',
							Filter: 'FBL~IDLab~INN~16',
							AllRecords: true,
							Projection: { Mode: 'Distinct', Columns: [ 'IDSample' ] },
							Destination: 'AppData.JoinIDs',
						},
					],
					function (pError)
					{
						Expect(pError).to.not.exist;
						Expect(tmpPict.AppData.JoinIDs).to.deep.equal(TEST_DISTINCT_RECORDS);
						Expect(tmpRequestTrace.some((u) => u.includes('/SampleLabJoins/Distinct/IDSample/'))).to.equal(true);
						return fDone();
					});
			});

		test(
			'Distinct read failure falls back to a full record read.',
			function(fDone)
			{
				const tmpPict = new libPict({ Product: 'DistinctFallbackTest', PictDefaultURLPrefix: 'http://localhost:1/1.0/' });
				const tmpRequestTrace = [];
				const tmpWarnings = [];
				const tmpOriginalWarn = tmpPict.log.warn.bind(tmpPict.log);
				tmpPict.log.warn = (...pArgs) =>
				{
					tmpWarnings.push(String(pArgs[0]));
					return tmpOriginalWarn(...pArgs);
				};
				tmpPict.EntityProvider.restClient = buildStubRestClient({ FailDistinct: true }, tmpRequestTrace);
				tmpPict.EntityProvider.gatherDataFromServer(
					[
						{
							Entity: 'SampleLabJoin',
							Filter: 'FBL~IDLab~INN~16',
							AllRecords: true,
							Projection: { Mode: 'Distinct', Columns: [ 'IDSample' ] },
							Destination: 'AppData.JoinRecords',
						},
					],
					function (pError)
					{
						Expect(pError).to.not.exist;
						Expect(tmpPict.AppData.JoinRecords).to.deep.equal(TEST_RECORDS);
						Expect(tmpWarnings.some((w) => w.includes('falling back to a full record read'))).to.equal(true);
						return fDone();
					});
			});
	});
