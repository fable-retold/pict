/**
* Unit tests for response validation on the Meadow entity provider.
*
* Two holes are covered here:
*
*   Reads  — a 2xx whose body is not a record array used to register as an empty
*            page on the paged read paths, silently dropping rows out of an
*            assembled entity set while reporting success. The legacy API emits
*            exactly that shape (HTTP 200 with an `{ Error: ... }` envelope).
*
*   Writes — the write methods inspected only the transport error, so a 4xx/5xx
*            rejection reached the caller as a success whose "record" was an
*            error envelope.
*/

const Chai = require('chai');
const Expect = Chai.expect;

const libPict = require('../source/Pict.js');

/** The shape the legacy API returns for a failed read: HTTP 200, error in the body. */
const LEGACY_ERROR_BODY = { Error: 'Database connection lost' };

/**
 * Stand up a provider whose reads are served by a scripted page map.
 *
 * @param {Record<string, any>} pPageBodies - Map of URL page stanza (e.g. '/2/2') to response body.
 * @param {number} pCount - What the Count endpoint reports.
 * @param {number} pBatchSize - Download batch size (page size).
 * @return {Object} The pict instance.
 */
function buildPagedHarness(pPageBodies, pCount, pBatchSize)
{
	const tmpPict = new libPict({ Product: 'ResponseValidation', PictDefaultDownloadBatchSize: pBatchSize });
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
				return fCallback(null, { statusCode: 200 }, { Count: pCount });
			}
			for (const tmpStanza of Object.keys(pPageBodies))
			{
				if (tmpURL.endsWith(tmpStanza))
				{
					return fCallback(null, { statusCode: 200 }, pPageBodies[tmpStanza]);
				}
			}
			return fCallback(null, { statusCode: 200 }, []);
		},
		postJSON: (pOptions, fCallback) => fCallback(null, { statusCode: 200 }, []),
	};
	return tmpPict;
}

/**
 * Stand up a provider whose writes all answer with a given status and body.
 *
 * @param {number} pStatusCode - Status for every write.
 * @param {*} pBody - Body for every write.
 * @return {Object} The pict instance.
 */
function buildWriteHarness(pStatusCode, pBody)
{
	const tmpPict = new libPict({ Product: 'WriteValidation' });
	const fRespond = (pOptions, fCallback) => fCallback(null, { statusCode: pStatusCode, statusMessage: 'Bad Request' }, pBody);
	tmpPict.EntityProvider.restClient =
	{
		getJSON: (pOptions, fCallback) => fRespond(pOptions, fCallback),
		postJSON: (pOptions, fCallback) => fRespond(pOptions, fCallback),
		putJSON: (pOptions, fCallback) => fRespond(pOptions, fCallback),
		delJSON: (pOptions, fCallback) => fRespond(pOptions, fCallback),
	};
	return tmpPict;
}

suite(
	'Pict Entity Provider Response Validation',
	function ()
	{
		suite(
			'Paged reads',
			function ()
			{
				test(
					'a 200 carrying the legacy error envelope fails instead of silently dropping a page',
					function (fTestComplete)
					{
						// Count promises 6; the middle page answers 200 with { Error: ... }.
						// Before this guard the caller got 4 records and no error at all.
						const tmpPict = buildPagedHarness(
							{
								'/0/2': [ { IDBook: 1 }, { IDBook: 2 } ],
								'/2/2': LEGACY_ERROR_BODY,
								'/4/2': [ { IDBook: 5 }, { IDBook: 6 } ],
							}, 6, 2);

						tmpPict.EntityProvider.getEntitySet('Book', 'FBV~Genre~EQ~SciFi',
							(pError) =>
							{
								Expect(pError).to.be.an.instanceof(Error);
								Expect(pError.message).to.contain('not a record array');
								Expect(pError.message).to.contain('Book');
								fTestComplete();
							});
					});

				test(
					'a complete multi-page read still succeeds and reassembles in order',
					function (fTestComplete)
					{
						const tmpPict = buildPagedHarness(
							{
								'/0/2': [ { IDBook: 1 }, { IDBook: 2 } ],
								'/2/2': [ { IDBook: 3 }, { IDBook: 4 } ],
								'/4/2': [ { IDBook: 5 } ],
							}, 5, 2);

						tmpPict.EntityProvider.getEntitySet('Book', 'FBV~Genre~EQ~SciFi',
							(pError, pEntitySet) =>
							{
								Expect(pError).to.not.be.an.instanceof(Error);
								Expect(pEntitySet.map((pRecord) => pRecord.IDBook)).to.deep.equal([ 1, 2, 3, 4, 5 ]);
								fTestComplete();
							});
					});

				test(
					'an empty page is still a valid page, not a failure',
					function (fTestComplete)
					{
						const tmpPict = buildPagedHarness({ '/0/2': [] }, 0, 2);
						tmpPict.EntityProvider.getEntitySet('Book', 'FBV~Genre~EQ~None',
							(pError, pEntitySet) =>
							{
								Expect(pError).to.not.be.an.instanceof(Error);
								Expect(pEntitySet).to.deep.equal([]);
								fTestComplete();
							});
					});

				test(
					'getEntitySetPage rejects a non-array body too',
					function (fTestComplete)
					{
						const tmpPict = buildPagedHarness({ '/0/50': LEGACY_ERROR_BODY }, 1, 50);
						tmpPict.EntityProvider.getEntitySetPage('Book', 'FBV~Genre~EQ~SciFi', 0, 50,
							(pError) =>
							{
								Expect(pError).to.be.an.instanceof(Error);
								Expect(pError.message).to.contain('not a record array');
								fTestComplete();
							});
					});

				test(
					'a transport error is passed through unchanged, not masked by the array guard',
					function (fTestComplete)
					{
						const tmpTransportError = new Error('socket hang up');
						const tmpPict = new libPict({ Product: 'ResponseValidationTransport' });
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
									return fCallback(null, { statusCode: 200 }, { Count: 2 });
								}
								return fCallback(tmpTransportError, undefined, undefined);
							},
							postJSON: (pOptions, fCallback) => fCallback(null, { statusCode: 200 }, []),
						};
						tmpPict.EntityProvider.getEntitySet('Book', 'FBV~Genre~EQ~SciFi',
							(pError) =>
							{
								Expect(pError).to.equal(tmpTransportError);
								fTestComplete();
							});
					});

				test(
					'a 4xx page read still fails, with the status in the message',
					function (fTestComplete)
					{
						const tmpPict = new libPict({ Product: 'ResponseValidation4xx' });
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
									return fCallback(null, { statusCode: 200 }, { Count: 2 });
								}
								return fCallback(null, { statusCode: 403, statusMessage: 'Forbidden' }, { Error: 'nope' });
							},
							postJSON: (pOptions, fCallback) => fCallback(null, { statusCode: 200 }, []),
						};
						tmpPict.EntityProvider.getEntitySet('Book', 'FBV~Genre~EQ~SciFi',
							(pError) =>
							{
								Expect(pError).to.be.an.instanceof(Error);
								Expect(pError.message).to.contain('403');
								fTestComplete();
							});
					});
			});

		suite(
			'Writes',
			function ()
			{
				const WRITE_CASES =
					[
						{ Name: 'createEntity', Invoke: (pProvider, fCallback) => pProvider.createEntity('Book', { Name: 'x' }, fCallback) },
						{ Name: 'updateEntity', Invoke: (pProvider, fCallback) => pProvider.updateEntity('Book', { IDBook: 1 }, fCallback) },
						{ Name: 'upsertEntity', Invoke: (pProvider, fCallback) => pProvider.upsertEntity('Book', { IDBook: 1 }, fCallback) },
						{ Name: 'upsertEntities', Invoke: (pProvider, fCallback) => pProvider.upsertEntities('Book', [ { IDBook: 1 } ], fCallback) },
						{ Name: 'deleteEntity', Invoke: (pProvider, fCallback) => pProvider.deleteEntity('Book', 1, fCallback) },
					];

				for (const tmpCase of WRITE_CASES)
				{
					test(
						`${tmpCase.Name} surfaces a 4xx rejection as an error rather than a success`,
						function (fTestComplete)
						{
							const tmpPict = buildWriteHarness(400, { Error: 'Record validation failed' });
							tmpCase.Invoke(tmpPict.EntityProvider,
								(pError) =>
								{
									Expect(pError, `${tmpCase.Name} should have errored`).to.be.an.instanceof(Error);
									Expect(pError.message).to.contain('400');
									fTestComplete();
								});
						});

					test(
						`${tmpCase.Name} surfaces a 500 rejection as an error`,
						function (fTestComplete)
						{
							const tmpPict = buildWriteHarness(500, { Error: 'boom' });
							tmpCase.Invoke(tmpPict.EntityProvider,
								(pError) =>
								{
									Expect(pError).to.be.an.instanceof(Error);
									Expect(pError.message).to.contain('500');
									fTestComplete();
								});
						});

					test(
						`${tmpCase.Name} still succeeds on a 2xx`,
						function (fTestComplete)
						{
							const tmpPict = buildWriteHarness(200, { IDBook: 1 });
							tmpCase.Invoke(tmpPict.EntityProvider,
								(pError, pBody) =>
								{
									Expect(pError).to.not.be.an.instanceof(Error);
									Expect(pBody).to.deep.equal({ IDBook: 1 });
									fTestComplete();
								});
						});
				}

				test(
					'a write transport error is passed through unchanged',
					function (fTestComplete)
					{
						const tmpTransportError = new Error('ECONNRESET');
						const tmpPict = new libPict({ Product: 'WriteValidationTransport' });
						tmpPict.EntityProvider.restClient =
							{ postJSON: (pOptions, fCallback) => fCallback(tmpTransportError, undefined, undefined) };
						tmpPict.EntityProvider.createEntity('Book', { Name: 'x' },
							(pError) =>
							{
								Expect(pError).to.equal(tmpTransportError);
								fTestComplete();
							});
					});

				test(
					'a bulk upsert returning a non-array 2xx body no longer throws on .length',
					function (fTestComplete)
					{
						// The success log read pBody.length unguarded; a non-array body made
						// that read undefined rather than a count.
						const tmpPict = buildWriteHarness(200, { Error: 'not an array' });
						tmpPict.EntityProvider.upsertEntities('Book', [ { IDBook: 1 } ],
							(pError, pBody) =>
							{
								Expect(pError).to.not.be.an.instanceof(Error);
								Expect(pBody).to.deep.equal({ Error: 'not an array' });
								fTestComplete();
							});
					});
			});
	});
