/**
* Unit tests for how the Meadow entity provider resolves POST /:Entity/Query
* support from the `<Entity>/Schema` probe, and how reads choose a transport
* when that probe fails.
*/

const Chai = require('chai');
const Expect = Chai.expect;

const libPict = require('../source/Pict.js');

const TEST_RECORDS = [ { IDBook: 1, Title: 'A' }, { IDBook: 2, Title: 'B' } ];
const SUPPORTED_SCHEMA = { title: 'Book', properties: { IDBook: { type: 'integer' } }, RetoldMetadata: { Capabilities: { QueryEndpoint: true } } };

/**
 * Build a long IN-list filter whose GET URL is well past any gateway limit.
 *
 * @param {number} pCount - How many IDs to include.
 * @return {string} The meadow filter expression.
 */
function buildLongInFilter(pCount)
{
	const tmpIDs = [];
	for (let i = 0; i < pCount; i++)
	{
		tmpIDs.push(100000 + i);
	}
	return `FBL~IDBook~INN~${tmpIDs.join(',')}`;
}

/**
 * Stand up a pict instance whose entity provider talks to a scripted stub.
 *
 * @param {Array<{ StatusCode: number, Body: any, Error?: Error }>} pSchemaResponses - Successive Schema responses (the last one repeats).
 * @param {Record<string, any>} [pSettings] - Extra pict settings.
 * @return {{ Pict: any, Trace: Array<{ Verb: string, URL: string, Body: any }> }} The harness.
 */
function buildHarness(pSchemaResponses, pSettings)
{
	const tmpTrace = [];
	let tmpSchemaCall = 0;
	const tmpPict = new libPict(Object.assign({ Product: 'QueryCapabilityTest' }, pSettings || {}));
	const handle = (pVerb, pOptionsOrURL, fCallback) =>
	{
		const tmpIsString = (typeof pOptionsOrURL === 'string');
		const tmpURL = tmpIsString ? pOptionsOrURL : pOptionsOrURL.url;
		const tmpBody = tmpIsString ? null : (pOptionsOrURL.body || null);
		tmpTrace.push({ Verb: pVerb, URL: tmpURL, Body: tmpBody });

		if (tmpURL.endsWith('/Schema'))
		{
			const tmpResponse = pSchemaResponses[Math.min(tmpSchemaCall, pSchemaResponses.length - 1)];
			tmpSchemaCall++;
			return fCallback(tmpResponse.Error || null, tmpResponse.Error ? undefined : { statusCode: tmpResponse.StatusCode }, tmpResponse.Body);
		}
		if ((pVerb === 'GET') && (tmpURL.length > 8000))
		{
			return fCallback(null, { statusCode: 414, statusMessage: 'URI Too Long' }, {});
		}
		if (tmpURL.includes('/Count') || (tmpBody && tmpBody.Count))
		{
			return fCallback(null, { statusCode: 200 }, { Count: TEST_RECORDS.length });
		}
		return fCallback(null, { statusCode: 200 }, TEST_RECORDS);
	};
	const handleLater = (pVerb, pOptionsOrURL, fCallback) =>
	{
		setTimeout(() => handle(pVerb, pOptionsOrURL, fCallback), 0);
	};
	tmpPict.EntityProvider.restClient.getJSON = (pOptionsOrURL, fCallback) => handleLater('GET', pOptionsOrURL, fCallback);
	tmpPict.EntityProvider.restClient.postJSON = (pOptions, fCallback) => handleLater('POST', pOptions, fCallback);
	return { Pict: tmpPict, Trace: tmpTrace };
}

/**
 * @param {Array<{ Verb: string, URL: string }>} pTrace - The request trace.
 * @return {Array<{ Verb: string, URL: string }>} The non-Schema requests.
 */
function dataRequests(pTrace)
{
	return pTrace.filter((pEntry) => !pEntry.URL.endsWith('/Schema'));
}

/**
 * @param {Array<{ Verb: string, URL: string }>} pTrace - The request trace.
 * @return {number} How many Schema probes were sent.
 */
function schemaProbeCount(pTrace)
{
	return pTrace.filter((pEntry) => pEntry.URL.endsWith('/Schema')).length;
}

const UNAUTHORIZED = { StatusCode: 401, Body: { Error: 'You must be authenticated to access this resource.' } };

suite(
	'Pict Entity Provider Query Capability',
	function ()
	{
		suite(
			'Schema probe outcomes',
			function ()
			{
				test(
					'A usable schema caches support and is not probed again.',
					function (fDone)
					{
						const tmpHarness = buildHarness([ { StatusCode: 200, Body: SUPPORTED_SCHEMA } ]);
						const tmpProvider = tmpHarness.Pict.EntityProvider;
						tmpProvider.resolveEntityQuerySupport('Book', '', (pError, pSupportsQuery) =>
						{
							Expect(pError).to.equal(null);
							Expect(pSupportsQuery).to.equal(true);
							tmpProvider.resolveEntityQuerySupport('Book', '', (pSecondError, pSecondSupportsQuery) =>
							{
								Expect(pSecondSupportsQuery).to.equal(true);
								Expect(schemaProbeCount(tmpHarness.Trace)).to.equal(1);
								return fDone();
							});
						});
					});

				test(
					'An auth failure is unresolved, not cached, and probed again on the next call.',
					function (fDone)
					{
						const tmpHarness = buildHarness([ UNAUTHORIZED, { StatusCode: 200, Body: SUPPORTED_SCHEMA } ]);
						const tmpProvider = tmpHarness.Pict.EntityProvider;
						tmpProvider.resolveEntityQuerySupport('Book', '', (pError, pSupportsQuery) =>
						{
							Expect(pError).to.be.an('error');
							Expect(pSupportsQuery).to.equal(false);
							Expect(tmpProvider.endpointCapabilityCache).to.not.have.property('/1.0/::Book');
							Expect(tmpProvider.entitySchemaCache).to.not.have.property('/1.0/::Book');
							tmpProvider.resolveEntityQuerySupport('Book', '', (pSecondError, pSecondSupportsQuery) =>
							{
								Expect(pSecondError).to.equal(null);
								Expect(pSecondSupportsQuery).to.equal(true);
								Expect(schemaProbeCount(tmpHarness.Trace)).to.equal(2);
								return fDone();
							});
						});
					});

				test(
					'An error object delivered with a success status is unresolved.',
					function (fDone)
					{
						const tmpHarness = buildHarness([ { StatusCode: 200, Body: { Error: 'Session expired.' } } ]);
						tmpHarness.Pict.EntityProvider.resolveEntityQuerySupport('Book', '', (pError, pSupportsQuery) =>
						{
							Expect(pError).to.be.an('error');
							Expect(pSupportsQuery).to.equal(false);
							Expect(tmpHarness.Pict.EntityProvider.endpointCapabilityCache).to.not.have.property('/1.0/::Book');
							return fDone();
						});
					});

				test(
					'A transport error is unresolved.',
					function (fDone)
					{
						const tmpHarness = buildHarness([ { StatusCode: 0, Body: null, Error: new Error('ECONNRESET') } ]);
						tmpHarness.Pict.EntityProvider.resolveEntityQuerySupport('Book', '', (pError, pSupportsQuery) =>
						{
							Expect(pError).to.be.an('error');
							Expect(pSupportsQuery).to.equal(false);
							return fDone();
						});
					});

				test(
					'A missing Schema route caches unsupported and is not probed again.',
					function (fDone)
					{
						const tmpHarness = buildHarness([ { StatusCode: 404, Body: { Error: 'route not found' } } ]);
						const tmpProvider = tmpHarness.Pict.EntityProvider;
						tmpProvider.resolveEntityQuerySupport('Book', '', (pError, pSupportsQuery) =>
						{
							Expect(pError).to.equal(null);
							Expect(pSupportsQuery).to.equal(false);
							tmpProvider.resolveEntityQuerySupport('Book', '', () =>
							{
								Expect(schemaProbeCount(tmpHarness.Trace)).to.equal(1);
								return fDone();
							});
						});
					});

				test(
					'getEntitySchema passes a failed body through without caching it.',
					function (fDone)
					{
						const tmpHarness = buildHarness([ UNAUTHORIZED, { StatusCode: 200, Body: SUPPORTED_SCHEMA } ]);
						const tmpProvider = tmpHarness.Pict.EntityProvider;
						tmpProvider.getEntitySchema('Book', '', (pError, pSchema, pOutcome) =>
						{
							Expect(pError).to.equal(null);
							Expect(pSchema).to.have.property('Error');
							Expect(pOutcome).to.equal('Failed');
							Expect(tmpProvider.entitySchemaCache).to.not.have.property('/1.0/::Book');
							tmpProvider.getEntitySchema('Book', '', (pSecondError, pSecondSchema, pSecondOutcome) =>
							{
								Expect(pSecondError).to.equal(null);
								Expect(pSecondSchema).to.have.property('title', 'Book');
								Expect(pSecondOutcome).to.equal('Schema');
								Expect(schemaProbeCount(tmpHarness.Trace)).to.equal(2);
								return fDone();
							});
						});
					});

				test(
					'Priming from an error body caches nothing.',
					function ()
					{
						const tmpHarness = buildHarness([ UNAUTHORIZED ]);
						const tmpProvider = tmpHarness.Pict.EntityProvider;
						Expect(tmpProvider.primeEntityCapabilityFromSchema('Book', UNAUTHORIZED.Body, '')).to.equal(false);
						Expect(tmpProvider.endpointCapabilityCache).to.not.have.property('/1.0/::Book');
						Expect(tmpProvider.primeEntityCapabilityFromSchema('Book', SUPPORTED_SCHEMA, '')).to.equal(true);
						Expect(tmpProvider.endpointCapabilityCache['/1.0/::Book'].SupportsQuery).to.equal(true);
					});

				test(
					'Concurrent callers of a failed probe all see it as unresolved.',
					function (fDone)
					{
						const tmpHarness = buildHarness([ UNAUTHORIZED ]);
						const tmpProvider = tmpHarness.Pict.EntityProvider;
						const tmpResults = [];
						const fCollect = (pError, pSupportsQuery) =>
						{
							tmpResults.push({ Error: pError, SupportsQuery: pSupportsQuery });
							if (tmpResults.length < 3)
							{
								return;
							}
							Expect(schemaProbeCount(tmpHarness.Trace)).to.equal(1);
							for (const tmpResult of tmpResults)
							{
								Expect(tmpResult.Error).to.be.an('error');
								Expect(tmpResult.SupportsQuery).to.equal(false);
							}
							return fDone();
						};
						tmpProvider.resolveEntityQuerySupport('Book', '', fCollect);
						tmpProvider.resolveEntityQuerySupport('Book', '', fCollect);
						tmpProvider.resolveEntityQuerySupport('Book', '', fCollect);
					});
			});

		suite(
			'Transport choice when support is unresolved',
			function ()
			{
				test(
					'A count with a long IN-list goes out as POST Query.',
					function (fDone)
					{
						const tmpHarness = buildHarness([ UNAUTHORIZED ]);
						tmpHarness.Pict.EntityProvider.getEntitySetRecordCount('Book', buildLongInFilter(7000), (pError, pCount) =>
						{
							Expect(pError).to.equal(null);
							Expect(pCount).to.equal(TEST_RECORDS.length);
							const tmpRequests = dataRequests(tmpHarness.Trace);
							Expect(tmpRequests).to.have.length(1);
							Expect(tmpRequests[0].Verb).to.equal('POST');
							Expect(tmpRequests[0].URL).to.equal('/1.0/Books/Query');
							Expect(tmpRequests[0].Body.Count).to.equal(true);
							Expect(tmpRequests[0].Body.Filter).to.match(/^FBL~IDBook~INN~/);
							return fDone();
						});
					});

				test(
					'A short count stays on GET.',
					function (fDone)
					{
						const tmpHarness = buildHarness([ UNAUTHORIZED ]);
						tmpHarness.Pict.EntityProvider.getEntitySetRecordCount('Book', 'FBV~IDBook~EQ~1', (pError) =>
						{
							Expect(pError).to.equal(null);
							const tmpRequests = dataRequests(tmpHarness.Trace);
							Expect(tmpRequests).to.have.length(1);
							Expect(tmpRequests[0].Verb).to.equal('GET');
							Expect(tmpRequests[0].URL).to.equal('/1.0/Books/Count/FilteredTo/FBV~IDBook~EQ~1');
							return fDone();
						});
					});

				test(
					'A full set read with a long IN-list sends its count and pages as POST Query.',
					function (fDone)
					{
						const tmpHarness = buildHarness([ UNAUTHORIZED ]);
						tmpHarness.Pict.EntityProvider.getEntitySet('Book', buildLongInFilter(7000), (pError, pRecords) =>
						{
							Expect(pError).to.not.be.an('error');
							Expect(pRecords).to.have.length(TEST_RECORDS.length);
							const tmpRequests = dataRequests(tmpHarness.Trace);
							Expect(tmpRequests.length).to.be.at.least(2);
							for (const tmpRequest of tmpRequests)
							{
								Expect(tmpRequest.Verb).to.equal('POST');
								Expect(tmpRequest.URL).to.equal('/1.0/Books/Query');
							}
							return fDone();
						});
					});

				test(
					'A long distinct read goes out as POST Query.',
					function (fDone)
					{
						const tmpHarness = buildHarness([ UNAUTHORIZED ]);
						const tmpProvider = tmpHarness.Pict.EntityProvider;
						tmpProvider._readEntityPage('Book', buildLongInFilter(7000), 0, 100,
							{ SupportsQuery: false, SupportUnresolved: true, Projection: { Mode: 'Distinct', Columns: [ 'Title' ] } },
							(pError) =>
							{
								Expect(pError).to.equal(null);
								Expect(tmpHarness.Trace).to.have.length(1);
								Expect(tmpHarness.Trace[0].Verb).to.equal('POST');
								Expect(tmpHarness.Trace[0].Body.Distinct).to.equal(true);
								return fDone();
							});
					});

				test(
					'The length threshold is configurable through settings.',
					function (fDone)
					{
						const tmpHarness = buildHarness([ UNAUTHORIZED ], { PictMeadowUnresolvedQueryURLLengthThreshold: 10 });
						tmpHarness.Pict.EntityProvider.getEntitySetRecordCount('Book', 'FBV~IDBook~EQ~1', (pError) =>
						{
							Expect(pError).to.equal(null);
							Expect(dataRequests(tmpHarness.Trace)[0].Verb).to.equal('POST');
							return fDone();
						});
					});
			});

		suite(
			'Transport choice when support is known',
			function ()
			{
				test(
					'A server without a Schema route keeps long reads on GET.',
					function (fDone)
					{
						const tmpHarness = buildHarness([ { StatusCode: 404, Body: { Error: 'route not found' } } ]);
						tmpHarness.Pict.EntityProvider.getEntitySetRecordCount('Book', buildLongInFilter(7000), (pError) =>
						{
							Expect(pError).to.be.an('error');
							Expect(pError.message).to.contain('414');
							Expect(dataRequests(tmpHarness.Trace)[0].Verb).to.equal('GET');
							return fDone();
						});
					});

				test(
					'Opting out of the Query transport keeps long reads on GET, with no probe.',
					function (fDone)
					{
						const tmpHarness = buildHarness([ UNAUTHORIZED ], { PictMeadowUseQueryEndpoint: false });
						tmpHarness.Pict.EntityProvider.getEntitySetRecordCount('Book', buildLongInFilter(7000), () =>
						{
							Expect(schemaProbeCount(tmpHarness.Trace)).to.equal(0);
							Expect(dataRequests(tmpHarness.Trace)[0].Verb).to.equal('GET');
							return fDone();
						});
					});

				test(
					'A supporting server sends even short reads as POST Query.',
					function (fDone)
					{
						const tmpHarness = buildHarness([ { StatusCode: 200, Body: SUPPORTED_SCHEMA } ]);
						tmpHarness.Pict.EntityProvider.getEntitySetRecordCount('Book', 'FBV~IDBook~EQ~1', (pError) =>
						{
							Expect(pError).to.equal(null);
							Expect(dataRequests(tmpHarness.Trace)[0].Verb).to.equal('POST');
							return fDone();
						});
					});
			});
	});
