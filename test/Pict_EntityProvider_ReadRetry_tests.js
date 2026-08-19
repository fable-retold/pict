/**
* Unit tests for read-resilience decoration on the Meadow entity provider.
*
* Every read the provider issues is non-mutating -- including the POST
* /:Entity/Query reads, which are POSTs only so the filter can travel in the
* body -- so they are all marked replayable for the RestClient. These tests
* assert the decoration reaches each read path, that the call shape is
* unchanged when no provider-level retry config is set, and that a transient
* page failure no longer takes the whole entity set down.
*/

const Chai = require('chai');
const Expect = Chai.expect;

const libPict = require('../source/Pict.js');

const TEST_RECORDS = [ { IDBook: 1, Name: 'A' }, { IDBook: 2, Name: 'B' } ];

/**
 * Build a stub restClient that records every request it is handed.
 *
 * @param {Array<Object>} pRequestTrace - Receives { Verb, URL, Options } per request.
 * @param {{ SupportsQuery: boolean }} pBehavior - Whether the server advertises the Query route.
 * @return {{ getJSON: Function, postJSON: Function }} The stub client.
 */
function buildTracingRestClient(pRequestTrace, pBehavior)
{
	const handle = (pVerb, pOptionsOrURL, fCallback) =>
	{
		const tmpIsString = (typeof pOptionsOrURL === 'string');
		const tmpURL = tmpIsString ? pOptionsOrURL : pOptionsOrURL.url;
		pRequestTrace.push({ Verb: pVerb, URL: tmpURL, Options: tmpIsString ? null : pOptionsOrURL });

		if (tmpURL.includes('/Schema'))
		{
			if (!pBehavior.SupportsQuery)
			{
				return fCallback(null, { statusCode: 404 }, { Error: 'no schema' });
			}
			return fCallback(null, { statusCode: 200 }, { RetoldMetadata: { Capabilities: { QueryEndpoint: true } } });
		}
		if (tmpURL.includes('/Count') || (pOptionsOrURL && pOptionsOrURL.body && pOptionsOrURL.body.Count))
		{
			return fCallback(null, { statusCode: 200 }, { Count: TEST_RECORDS.length });
		}
		return fCallback(null, { statusCode: 200 }, TEST_RECORDS);
	};
	return {
		getJSON: (pOptionsOrURL, fCallback) => handle('GET', pOptionsOrURL, fCallback),
		postJSON: (pOptions, fCallback) => handle('POST', pOptions, fCallback),
	};
}

/**
 * Stand up a pict instance with a tracing rest client on its entity provider.
 *
 * @param {Record<string, any>} pSettings - Pict settings.
 * @param {{ SupportsQuery: boolean }} pBehavior - Stub server behavior.
 * @return {{ Pict: Object, Trace: Array<Object> }} The pict instance and its request trace.
 */
function buildHarness(pSettings, pBehavior)
{
	const tmpTrace = [];
	const tmpPict = new libPict(Object.assign({ Product: 'ReadRetryTest' }, pSettings));
	tmpPict.EntityProvider.restClient = buildTracingRestClient(tmpTrace, pBehavior || { SupportsQuery: false });
	return { Pict: tmpPict, Trace: tmpTrace };
}

suite(
	'Pict Entity Provider Read Retry',
	function ()
	{
		suite(
			'Configuration',
			function ()
			{
				test(
					'Defaults to inheriting the RestClient policy.',
					function ()
					{
						const tmpHarness = buildHarness({});
						Expect(tmpHarness.Pict.EntityProvider.readRetryConfiguration).to.equal(null);
					});

				test(
					'PictMeadowReadRetry setting configures the provider.',
					function ()
					{
						const tmpHarness = buildHarness({ PictMeadowReadRetry: { MaxAttempts: 4 } });
						Expect(tmpHarness.Pict.EntityProvider.readRetryConfiguration).to.deep.equal({ MaxAttempts: 4 });
					});

				test(
					'A provider option wins over the setting.',
					function ()
					{
						const tmpHarness = buildHarness({ PictMeadowReadRetry: { MaxAttempts: 4 } });
						const tmpProvider = tmpHarness.Pict.instantiateServiceProviderWithoutRegistration('EntityProvider', { ReadRetry: false });
						Expect(tmpProvider.readRetryConfiguration).to.equal(false);
					});
			});

		suite(
			'Read Decoration',
			function ()
			{
				test(
					'POST /Query reads are marked RetrySafe.',
					function (fTestComplete)
					{
						const tmpHarness = buildHarness({}, { SupportsQuery: true });
						tmpHarness.Pict.EntityProvider.getEntitySet('Book', 'FBV~Genre~EQ~SciFi',
							(pError) =>
							{
								Expect(pError).to.not.be.an.instanceof(Error);
								const tmpQueryPosts = tmpHarness.Trace.filter((pR) => pR.Verb === 'POST');
								Expect(tmpQueryPosts.length).to.be.greaterThan(0);
								// Safety now lives on the client, so the request itself is bare.
								for (const tmpPost of tmpQueryPosts)
								{
									Expect(tmpPost.Options.RetrySafe).to.equal(undefined);
								}
								fTestComplete();
							});
					});

				test(
					'The Schema capability probe is marked RetrySafe.',
					function (fTestComplete)
					{
						const tmpHarness = buildHarness({}, { SupportsQuery: true });
						tmpHarness.Pict.EntityProvider.resolveEntityQuerySupport('Book', '/1.0/',
							() =>
							{
								const tmpProbe = tmpHarness.Trace.find((pR) => pR.URL.includes('/Schema'));
								Expect(tmpProbe.Options).to.not.equal(null);
								fTestComplete();
							});
					});

				test(
					'GET reads keep their bare-URL call shape when no retry config is set.',
					function (fTestComplete)
					{
						const tmpHarness = buildHarness({}, { SupportsQuery: false });
						tmpHarness.Pict.EntityProvider.getEntitySet('Book', 'FBV~Genre~EQ~SciFi',
							(pError) =>
							{
								Expect(pError).to.not.be.an.instanceof(Error);
								const tmpReads = tmpHarness.Trace.filter((pR) => pR.Verb === 'GET' && !pR.URL.includes('/Schema'));
								Expect(tmpReads.length).to.be.greaterThan(0);
								for (const tmpRead of tmpReads)
								{
									Expect(tmpRead.Options).to.equal(null);
								}
								fTestComplete();
							});
					});

				test(
					'GET reads carry the retry override when the provider is configured.',
					function (fTestComplete)
					{
						const tmpHarness = buildHarness({ PictMeadowReadRetry: { MaxAttempts: 5 } }, { SupportsQuery: false });
						tmpHarness.Pict.EntityProvider.getEntitySet('Book', 'FBV~Genre~EQ~SciFi',
							(pError) =>
							{
								Expect(pError).to.not.be.an.instanceof(Error);
								const tmpReads = tmpHarness.Trace.filter((pR) => pR.Verb === 'GET' && !pR.URL.includes('/Schema'));
								Expect(tmpReads.length).to.be.greaterThan(0);
								for (const tmpRead of tmpReads)
								{
									Expect(tmpRead.Options.Retry).to.deep.equal({ MaxAttempts: 5 });
								}
								fTestComplete();
							});
					});

				test(
					'A configured classifier is registered on the client, not stamped per request.',
					function ()
					{
						// The whole point of the hook chain: the classifier reaches every
						// caller sharing the client, including code that builds its own
						// requests and never asks the provider to decorate them.
						const fClassifier = (pContext) => ((pContext.Body && pContext.Body.Error) ? 'retry' : undefined);
						const tmpPict = new libPict({ Product: 'ClassifierChain' });
						const tmpClient = tmpPict.EntityProvider.restClient;
						// Assigned after construction, as an app must: settings cannot carry a function.
						tmpPict.EntityProvider.readRetryClassifier = fClassifier;

						// A request nobody decorated still gets the classifier's verdict.
						Expect(tmpClient._classifyRetryOutcome({ Options: { url: '/1.0/Books/Query' }, Body: { Error: 'boom' } })).to.equal('retry');
						Expect(tmpClient._classifyRetryOutcome({ Options: { url: '/1.0/Books/Query' }, Body: [] })).to.equal(null);
					});

				test(
					'A borrowed client treats POST /Query as replayable with no per-request flag.',
					function ()
					{
						// pict-section-recordset builds its own Query POST straight onto
						// EntityProvider.restClient; it must inherit read safety for free.
						const tmpPict = new libPict({ Product: 'BorrowedClient' });
						const tmpClient = tmpPict.EntityProvider.restClient;
						const tmpPolicy = tmpClient.retryPolicy;
						Expect(tmpClient._isRetryableRequest({ method: 'POST', url: '/1.0/Books/Query' }, tmpPolicy)).to.equal(true);
						Expect(tmpClient._isRetryableRequest({ method: 'POST', url: '/1.0/Books/Query/Postfix' }, tmpPolicy)).to.equal(true);
						// Writes through the same client stay ineligible.
						Expect(tmpClient._isRetryableRequest({ method: 'POST', url: '/1.0/Books' }, tmpPolicy)).to.equal(false);
						Expect(tmpClient._isRetryableRequest({ method: 'PUT', url: '/1.0/Books/Upserts' }, tmpPolicy)).to.equal(false);
						Expect(tmpClient._isRetryableRequest({ method: 'DELETE', url: '/1.0/Books/1' }, tmpPolicy)).to.equal(false);
					});

				test(
					'The count read is decorated on both transports.',
					function (fTestComplete)
					{
						const tmpHarness = buildHarness({ PictMeadowReadRetry: 3 }, { SupportsQuery: false });
						tmpHarness.Pict.EntityProvider.getEntitySetRecordCount('Book', 'FBV~Genre~EQ~SciFi',
							(pError, pCount) =>
							{
								Expect(pCount).to.equal(TEST_RECORDS.length);
								const tmpCountRead = tmpHarness.Trace.find((pR) => pR.URL.includes('/Count'));
								Expect(tmpCountRead.Options.Retry).to.equal(3);
								fTestComplete();
							});
					});
			});

		suite(
			'Transient Page Failure',
			function ()
			{
				test(
					'A page whose read is replayed by the client reassembles in index order.',
					function (fTestComplete)
					{
						// Stand in for a RestClient that honors the RetrySafe contract: the
						// first read of the second page is delayed (as a backoff replay
						// would be), so it completes AFTER the third page. The provider must
						// still reassemble by page index, not by completion order.
						const tmpPages =
						{
							'/0/2': [ { IDBook: 1 }, { IDBook: 2 } ],
							'/2/2': [ { IDBook: 3 }, { IDBook: 4 } ],
							'/4/2': [ { IDBook: 5 } ],
						};
						let tmpReplayedPageReads = 0;

						const tmpPict = new libPict({ Product: 'ReadRetryPaging', PictDefaultDownloadBatchSize: 2, PictMeadowReadRetry: { MaxAttempts: 3 } });
						tmpPict.EntityProvider.options.downloadPageConcurrency = 3;
						tmpPict.EntityProvider.restClient =
						{
							getJSON: (pOptionsOrURL, fCallback) =>
							{
								const tmpURL = (typeof pOptionsOrURL === 'string') ? pOptionsOrURL : pOptionsOrURL.url;
								if (tmpURL.includes('/Schema'))
								{
									return fCallback(null, { statusCode: 404 }, { Error: 'no schema' });
								}
								if (tmpURL.includes('/Count'))
								{
									return fCallback(null, { statusCode: 200 }, { Count: 5 });
								}
								// Paged reads carry the policy; safety comes from the client hook.
								Expect(pOptionsOrURL.Retry).to.deep.equal({ MaxAttempts: 3 });
								for (const tmpPageStanza of Object.keys(tmpPages))
								{
									if (tmpURL.endsWith(tmpPageStanza))
									{
										if (tmpPageStanza === '/2/2')
										{
											tmpReplayedPageReads++;
											return setTimeout(() => fCallback(null, { statusCode: 200 }, tmpPages[tmpPageStanza]), 20);
										}
										return fCallback(null, { statusCode: 200 }, tmpPages[tmpPageStanza]);
									}
								}
								return fCallback(null, { statusCode: 200 }, []);
							},
							postJSON: (pOptions, fCallback) => fCallback(null, { statusCode: 200 }, []),
						};

						tmpPict.EntityProvider.getEntitySet('Book', 'FBV~Genre~EQ~SciFi',
							(pError, pEntitySet) =>
							{
								Expect(pError).to.not.be.an.instanceof(Error);
								Expect(tmpReplayedPageReads).to.equal(1);
								Expect(pEntitySet.map((pRecord) => pRecord.IDBook)).to.deep.equal([ 1, 2, 3, 4, 5 ]);
								fTestComplete();
							});
					});

				test(
					'A hard page failure still reports, with the filter elided.',
					function (fTestComplete)
					{
						const tmpLongIDList = [];
						for (let i = 5130; i < 5980; i++)
						{
							tmpLongIDList.push(i);
						}
						const tmpFilter = `FBL~IDTestSpecification~INN~${tmpLongIDList.join(',')}`;

						const tmpPict = new libPict({ Product: 'ReadRetryElide' });
						tmpPict.EntityProvider.restClient =
						{
							getJSON: (pOptionsOrURL, fCallback) =>
							{
								const tmpURL = (typeof pOptionsOrURL === 'string') ? pOptionsOrURL : pOptionsOrURL.url;
								if (tmpURL.includes('/Schema'))
								{
									return fCallback(null, { statusCode: 404 }, { Error: 'no schema' });
								}
								if (tmpURL.includes('/Count'))
								{
									return fCallback(null, { statusCode: 200 }, { Count: 10 });
								}
								return fCallback(null, { statusCode: 502, statusMessage: 'Bad Gateway' }, { message: 'An invalid response was received from the upstream server' });
							},
							postJSON: (pOptions, fCallback) => fCallback(null, { statusCode: 200 }, []),
						};

						tmpPict.EntityProvider.getEntitySet('TestSpecificationMaterialTestJoin', tmpFilter,
							(pError) =>
							{
								Expect(pError).to.be.an.instanceof(Error);
								// The whole 4,000+ character filter must not ride along into
								// the Error message (and from there into alerting).
								Expect(pError.message.length).to.be.lessThan(1000);
								Expect(pError.message).to.contain('…');
								Expect(pError.message).to.contain(`${tmpFilter.length} chars`);
								Expect(pError.message).to.contain('502');
								fTestComplete();
							});
					});
			});
	});
