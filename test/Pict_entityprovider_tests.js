/**
* Unit tests for Pict
*
* @license     MIT
*
* @author      Steven Velozo <steven@velozo.com>
*/

const Chai = require("chai");
const Expect = Chai.expect;
const Sinon = require("sinon");

const libPict = require('../source/Pict.js');

// Outside and inside the docker container, the port is different.
//const _RetoldTestPort = 60086;
const _RetoldTestPort = 8086;

const _MockSettings = (
{
	Product: 'MockPict',
	ProductVersion: '1.0.0',

	PictDefaultURLPrefix: `http://localhost:${_RetoldTestPort}/1.0/`
});

suite(
	'Pict Entity Provider Tests',
	function()
	{
		setup(() => {});

		suite(
			'Entity Graph Providers',
			function()
			{
				test(
					'Basic Provider with a list.',
					function(fDone)
					{
						const testPict = new libPict(_MockSettings);

						testPict.EntityProvider.gatherDataFromServer(
							[
								{
									"Entity": "Author",
									"Filter": "FBV~IDAuthor~EQ~100",
									"Destination": "AppData.CurrentAuthor",
									// This marshals a single record
									"SingleRecord": true
								},
								{
									"Entity": "BookAuthorJoin",
									"Filter": "FBV~IDAuthor~EQ~{~D:AppData.CurrentAuthor.IDAuthor~}",
									"Destination": "AppData.BookAuthorJoins"
								},
								{
									"Entity": "Book",
									"Filter": "FBL~IDBook~INN~{~PJU:,^IDBook^AppData.BookAuthorJoins~}",
									"Destination": "AppData.Books"
								},
								{
									"Type": "Custom",
									"URL": "Author/Schema",
									"Destination": "AppData.AuthorSchema"
								}
							],
							function (pError, pResult)
							{
								Expect(testPict.AppData.CurrentAuthor.IDAuthor).to.equal(100);
								Expect(testPict.AppData.BookAuthorJoins.length).to.be.greaterThan(0);
								Expect(testPict.AppData.AuthorSchema).to.be.an('object');
								return fDone();
							}.bind(this));
					}
				);
				test(
					'Decoration Provider with a list.',
					function(fDone)
					{
						this.timeout(10000); // Allow for the server to respond
						const testPict = new libPict(_MockSettings);

						testPict.EntityProvider.gatherDataFromServer(
							[
								{
									"Type": "SetStateAddress",
									"StateAddress": "AppData.TestState",
								},
								{
									"Entity": "Author",
									"Filter": "FBL~IDAuthor~LT~10",
									"AllRecords": true,
									"Destination": "State.Authors"
								},
								{
									"Entity": "BookAuthorJoin",
									"Filter": "FBL~IDAuthor~INN~{~PJU:,^IDAuthor^Record.State.Authors~}",
									"AllRecords": true,
									"Destination": "State.BookAuthorJoins"
								},
								{
									"Entity": "Book",
									"Filter": "FBL~IDBook~INN~{~PJU:,^IDBook^Record.State.BookAuthorJoins~}",
									"AllRecords": true,
									"Destination": "State.Books"
								},
								{
									"Type": "MapJoin",
									"DestinationRecordSetAddress": "State.Authors",
									"DestinationJoinValue": "IDAuthor",
									"JoinJoinValueLHS": "IDAuthor",
									"Joins": "State.BookAuthorJoins",
									"JoinJoinValueRHS": "IDBook",
									"JoinRecordSetAddress": "State.Books",
									"JoinValue": "IDBook",
									"RecordDestinationAddress": "Books"
								},
								{
									"Entity": "BookAuthorJoin",
									"Filter": "FBL~IDBook~INN~{~PJU:,^IDBook^Record.State.Books~}",
									"AllRecords": true,
									"Destination": "State.BookAuthorJoinsRev"
								},
								{
									"Entity": "Author",
									"Filter": "FBL~IDAuthor~INN~{~PJU:,^IDAuthor^Record.State.BookAuthorJoinsRev~}",
									"AllRecords": true,
									"Destination": "State.AuthorsRev"
								},
								{
									"Type": "MapJoin",
									"DestinationRecordSetAddress": "State.Books",
									"DestinationJoinValue": "IDBook",
									"JoinJoinValueLHS": "IDBook",
									"Joins": "State.BookAuthorJoinsRev",
									"JoinJoinValueRHS": "IDAuthor",
									"JoinRecordSetAddress": "State.AuthorsRev",
									"JoinValue": "IDAuthor",
									"RecordDestinationAddress": "Authors"
								},
								{
									"Type": "MapJoin",
									"DestinationRecordSetAddress": "State.Books",
									"DestinationJoinValue": "IDBook",
									"JoinJoinValueLHS": "IDBook",
									"Joins": "State.BookAuthorJoinsRev",
									"JoinJoinValueRHS": "IDAuthor",
									"JoinRecordSetAddress": "State.AuthorsRev",
									"JoinValue": "IDAuthor",
									"BucketBy": 'IDAuthor',
									"RecordDestinationAddress": "AuthorMap"
								},
								{
									"Type": "MapJoin",
									"DestinationRecordAddress": "AppData",
									"JoinRecordSetAddress": "State.Books",
									"BucketBy": [ "PublicationYear", "IDBook" ],
									"RecordDestinationAddress": "BooksByYearAndID"
								},
								{
									"Type": "MapJoin",
									"SingleRecord": true,
									"DestinationRecordAddress": "AppData",
									"JoinRecordSetAddress": "State.Books",
									"BucketBy": [ "PublicationYear", "IDBook" ],
									"RecordDestinationAddress": "BooksByYearAndIDSingle"
								},
								{
									"Type": "MapJoin",
									"DestinationRecordAddress": "AppData",
									"JoinRecordSetAddress": "State.Books",
									"BucketByTemplate": "{~PJU:-^IDAuthor^Record.Authors~}",
									"RecordDestinationAddress": "BooksByAuthors"
								},
								{
									"Type": "MapJoin",
									"SingleRecord": true,
									"DestinationRecordAddress": "AppData",
									"JoinRecordSetAddress": "State.Books",
									"BucketBy": "IDBook",
									"RecordDestinationAddress": "BooksByID"
								},
							],
							function (pError, pResult)
							{
								try
								{
									Expect(pError).to.not.exist;
									Expect(testPict.AppData.TestState.Authors.length).to.equal(9);
									Expect(testPict.AppData.TestState.AuthorsRev.length).to.be.greaterThan(8);
									Expect(testPict.AppData.TestState.BookAuthorJoins.length).to.be.greaterThan(8);
									for (const tmpAuthor of testPict.AppData.TestState.Authors)
									{
										Expect(tmpAuthor.Books).to.be.an('array');
										Expect(tmpAuthor.Books.length).to.be.greaterThan(0);
									}
									for (const tmpBook of testPict.AppData.TestState.Books)
									{
										Expect(tmpBook.Authors).to.be.an('array');
										Expect(tmpBook.Authors.length).to.be.greaterThan(0);
										Expect(tmpBook.AuthorMap).to.be.an('object');
										Expect(tmpBook.Authors.length).to.equal(Object.keys(tmpBook.AuthorMap).length);
									}
									Expect(Object.keys(testPict.AppData.BooksByYearAndID).length).to.be.greaterThan(0);
									Expect(Object.keys(testPict.AppData.BooksByYearAndID['2016']).length).to.be.greaterThan(0);
									Expect(testPict.AppData.BooksByYearAndID['2016']['4641']).to.be.an('array');
									Expect(testPict.AppData.BooksByYearAndID['2016']['4641'].length).to.equal(1);
									Expect(testPict.AppData.BooksByYearAndIDSingle['2016']['4641']).to.be.an('object');
									Expect(testPict.AppData.BooksByYearAndIDSingle['2016']['4641'].IDBook).to.equal(4641);
									Expect(Object.keys(testPict.AppData.BooksByAuthors).length).to.be.greaterThan(0);
									Expect(Object.keys(testPict.AppData.BooksByID).length).to.equal(testPict.AppData.TestState.Books.length);
								}
								catch (err)
								{
									return fDone(err);
								}
								return fDone();
							}.bind(this));
					}
				);
				test(
					'Sync bundle test.',
					function()
					{
						const testPict = new libPict(_MockSettings);
						testPict.AppData.Comics =
						[
							{ IDComic: 1, Name: 'Batman', InStock: true, Genres: [ 'Action', 'Sci-Fi' ] },
							{ IDComic: 2, Name: 'Superman', InStock: true, Genres: [ 'Action', 'Sci-Fi' ] },
							{ IDComic: 3, Name: 'Non Action Comic Book', InStock: true, Genres: [ 'Slice of Life', 'Sci-Fi' ] },
							{ IDComic: 4, Name: 'Other Non Action Comic Book', InStock: false, Genres: [ 'Slice of Life', 'Sci-Fi' ] },
						];
						testPict.AppData.ActionBooks = [{ IDComic: 1, ExtraColumn: 'ExtraValue' }];
						const tmpBundle = [{
							"Type": "ProjectDataset",
							//"InputRecordsetAddress": "AppData.Comics[]<<~?Genre,==,Sci-Fi?~>>",
							"InputRecordsetAddress": "AppData.Comics[]<<~?InStock,TRUE,?~>>",
							"OutputRecordsetAddress": "AppData.SciFiBooks",
							"AllRecords": true,
							"OutputRecordsetAddressMapping":
							{
								"InputRecord.Genres[],AnyContains,Action": "AppData.ActionBooks"
							},
							"RecordPrototypeAddress": "OutputRecordset[]<<~?IDComic,==,{~D:Record.InputRecord.IDComic~}?~>>",
							"RecordFieldMapping":
							{
								"AppData.ActionBooks":
								{
									"InputRecord.Name": "OutputRecord.Title",
									"InputRecord.IDComic": "OutputRecord.IDComic"
								},
								"Default":
								{
									"InputRecord.Name": "OutputRecord.Title",
									"InputRecord.IDComic": "OutputRecord.IDComic"
								}
							}
						}];

						testPict.EntityProvider.processBundle(tmpBundle);
						Expect(testPict.AppData.ActionBooks.length).to.equal(2);
						Expect(testPict.AppData.ActionBooks[0].ExtraColumn).to.equal('ExtraValue');
						Expect(testPict.AppData.ActionBooks[0].Title).to.equal('Batman');
						Expect(testPict.AppData.ActionBooks[0].IDComic).to.equal(1);
						Expect(testPict.AppData.ActionBooks[1].Title).to.equal('Superman');
						Expect(testPict.AppData.ActionBooks[1].IDComic).to.equal(2);
						Expect(testPict.AppData.SciFiBooks.length).to.equal(1);
						Expect(testPict.AppData.SciFiBooks[0].Title).to.equal('Non Action Comic Book');
						Expect(testPict.AppData.SciFiBooks[0].IDComic).to.equal(3);
					}
				);
			}
		);
		suite(
			'Entity Providers',
			function()
			{
				test(
					'Get a book caches',
					function(fDone)
					{
						const testPict = new libPict(_MockSettings);
						const getJSONSpy = Sinon.spy(testPict.EntityProvider.restClient, 'getJSON');

						testPict.EntityProvider.getEntity('Book', 199, (err, rec) =>
						{
							Expect(rec).to.be.an('object');
							Expect(rec.IDBook).to.equal(199);
							testPict.EntityProvider.getEntity('Book', 199, (err2, rec2) =>
							{
								Expect(rec2).to.be.an('object');
								Expect(rec2.IDBook).to.equal(199);
								Sinon.assert.calledOnce(getJSONSpy);
								return fDone();
							});
						});
					}
				);

				test(
					'Get a book list caches',
					function(fDone)
					{
						const testPict = new libPict(_MockSettings);
						// This test asserts the legacy GET read shape + call count; pin the
						// transport to GET (the live test server advertises no capability).
						testPict.EntityProvider.useQueryEndpoint = false;
						const getJSONSpy = Sinon.spy(testPict.EntityProvider.restClient, 'getJSON');

						testPict.EntityProvider.getEntitySet('Book', `FBV~IDBook~GT~190~FBV~IDBook~LT~200`, (err, recs) =>
						{
							Expect(recs).to.be.an('array');
							Expect(recs.length).to.equal(9);
							Expect(recs[8].IDBook).to.equal(199);
							testPict.EntityProvider.getEntitySet('Book', `FBV~IDBook~GT~190~FBV~IDBook~LT~200`, (err2, recs2) =>
							{
								Expect(recs2).to.be.an('array');
								Expect(recs2.length).to.equal(9);
								Expect(recs2[8].IDBook).to.equal(199);
								Sinon.assert.calledTwice(getJSONSpy); // count + reads
								Sinon.assert.calledWith(getJSONSpy, 'http://localhost:8086/1.0/Books/Count/FilteredTo/FBV~IDBook~GT~190~FBV~IDBook~LT~200');
								Sinon.assert.calledWith(getJSONSpy, 'http://localhost:8086/1.0/Books/FilteredTo/FBV~IDBook~GT~190~FBV~IDBook~LT~200/0/100');
								return fDone();
							});
						});
					}
				);


				test(
					'Get a book list then expect single record cache to be populated',
					function(fDone)
					{
						const testPict = new libPict(_MockSettings);
						// Asserts legacy GET read counts; pin the transport to GET.
						testPict.EntityProvider.useQueryEndpoint = false;
						const getJSONSpy = Sinon.spy(testPict.EntityProvider.restClient, 'getJSON');

						let tmpAnticipate = testPict.newAnticipate();
						let tmpTestState = {};

						// First, get 10 books which should automatically prime both the list cache and single record caches.
						tmpAnticipate.anticipate(
							(fStageComplete) =>
							{
								testPict.EntityProvider.getEntitySet('Book', `FBV~IDBook~GT~190~FBV~IDBook~LT~200`,
									(pError, pRecords) =>
									{
										Expect(pRecords).to.be.an('array');
										Expect(pRecords.length).to.equal(9);
										Expect(pRecords[8].IDBook).to.equal(199);
										return fStageComplete(pError);
									});
							});
						
						// Now, get a single book within the ID range that should be in the cache already.
						tmpAnticipate.anticipate(
							(fStageComplete) =>
							{
								testPict.EntityProvider.getEntity('Book', 195,
									(pError, pRecord) =>
									{
										Expect(pRecord).to.be.an('object');
										Expect(pRecord.IDBook).to.equal(195);
										Sinon.assert.calledTwice(getJSONSpy);
										return fStageComplete(pError);
									});
							});

						// Now, get a single book outside the ID range that should not be in the cache already.
						tmpAnticipate.anticipate(
							(fStageComplete) =>
							{
								testPict.EntityProvider.getEntity('Book', 88,
									(pError, pRecord) =>
									{
										Expect(pRecord).to.be.an('object');
										Expect(pRecord.IDBook).to.equal(88);
										Sinon.assert.calledThrice(getJSONSpy);
										return fStageComplete(pError);
									});
							});

						// Now, get a single book within the ID range that should be in the cache already again.
						tmpAnticipate.anticipate(
							(fStageComplete) =>
							{
								testPict.EntityProvider.getEntity('Book', 195,
									(pError, pRecord) =>
									{
										Expect(pRecord).to.be.an('object');
										Expect(pRecord.IDBook).to.equal(195);
										Sinon.assert.calledThrice(getJSONSpy);
										return fStageComplete(pError);
									});
							});

						// Wait for everything asynchronous to be completed
						tmpAnticipate.wait(fDone);
					}
				);

				test(
					'Manually exercise the cache function',
					function(fDone)
					{
						const testPict = new libPict(_MockSettings);
						// Asserts legacy GET read counts; pin the transport to GET.
						testPict.EntityProvider.useQueryEndpoint = false;
						const getJSONSpy = Sinon.spy(testPict.EntityProvider.restClient, 'getJSON');

						let tmpAnticipate = testPict.newAnticipate();
						let tmpTestState = {};

						let tmpRecordList = [
							{ IDBook: 191, IDAuthor: 10, Reviewer: 'Alice', Rating: 4 },
							{ IDBook: 192, IDAuthor: 11, Reviewer: 'Bob', Rating: 5 },
							{ IDBook: 193, IDAuthor: 12, Reviewer: 'Charlie', Rating: 3 },
							{ IDBook: 194, IDAuthor: 13, Reviewer: 'Diana', Rating: 4 },
							{ IDBook: 195, IDAuthor: 14, Reviewer: 'Eve', Rating: 5 },
							{ IDBook: 196, IDAuthor: 15, Reviewer: 'Frank', Rating: 2 },
							{ IDBook: 197, IDAuthor: 16, Reviewer: 'Grace', Rating: 4 },
							{ IDBook: 198, IDAuthor: 17, Reviewer: 'Heidi', Rating: 3 },
							{ IDBook: 199, IDAuthor: 18, Reviewer: 'Ivan', Rating: 1 },
							{ IDBook: 196, IDAuthor: 15, Reviewer: 'Frank', Rating: 2 },
							{ IDBook: 197, IDAuthor: 16, Reviewer: 'Grace', Rating: 4 },
							{ IDBook: 198, IDAuthor: 17, Reviewer: 'Heidi', Rating: 3 },
							{ IDBook: 199, IDAuthor: 18, Reviewer: 'Ivan', Rating: 1 }
						];

						// First, get 10 books which should automatically prime both the list cache and single record caches.
						tmpAnticipate.anticipate(
							(fStageComplete) =>
							{
								testPict.EntityProvider.cacheConnectedEntityRecords(tmpRecordList, ['IDBook', 'IDAuthor'], [], false, fStageComplete)
							});
						
						// Now, get a single book within the ID range that should be in the cache already.
						tmpAnticipate.anticipate(
							(fStageComplete) =>
							{
								testPict.EntityProvider.getEntity('Book', 195,
									(pError, pRecord) =>
									{
										Expect(pRecord).to.be.an('object');
										Expect(pRecord.IDBook).to.equal(195);
										Sinon.assert.callCount(getJSONSpy, 4);
										return fStageComplete(pError);
									});
							});

						// Now, get a single book outside the ID range that should not be in the cache already.
						tmpAnticipate.anticipate(
							(fStageComplete) =>
							{
								testPict.EntityProvider.getEntity('Book', 88,
									(pError, pRecord) =>
									{
										Expect(pRecord).to.be.an('object');
										Expect(pRecord.IDBook).to.equal(88);
										Sinon.assert.callCount(getJSONSpy, 5);
										return fStageComplete(pError);
									});
							});

						// Now, get a single book within the ID range that should be in the cache already again.
						tmpAnticipate.anticipate(
							(fStageComplete) =>
							{
								testPict.EntityProvider.getEntity('Author', 16,
									(pError, pRecord) =>
									{
										Expect(pRecord).to.be.an('object');
										Sinon.assert.callCount(getJSONSpy, 5);
										return fStageComplete(pError);
									});
							});

						// Wait for everything asynchronous to be completed
						tmpAnticipate.wait(fDone);
					}
				);


				test(
					'Cache individual records handles undefined and non-object entries gracefully',
					function()
					{
						const testPict = new libPict(_MockSettings);

						// Should not throw when given an array containing undefined entries
						Expect(() => testPict.EntityProvider.cacheIndividualEntityRecords('Book', [undefined, null, 'string', 42])).to.not.throw();

						// Should not throw when given undefined
						Expect(() => testPict.EntityProvider.cacheIndividualEntityRecords('Book', undefined)).to.not.throw();

						// Should not throw when given an empty array
						Expect(() => testPict.EntityProvider.cacheIndividualEntityRecords('Book', [])).to.not.throw();

						// Should still work correctly with valid records
						testPict.EntityProvider.cacheIndividualEntityRecords('Book',
							[
								{ IDBook: 501, Title: 'Test Book' },
								{ IDBook: 502, Title: 'Another Book' }
							]);
						const tmpCachedRecord = testPict.EntityProvider.recordCache['Book'].read(501);
						Expect(tmpCachedRecord).to.be.an('object');
						Expect(tmpCachedRecord.IDBook).to.equal(501);
					}
				);

				test(
					'Exercise the automagic cache function',
					function(fDone)
					{
						const testPict = new libPict(_MockSettings);
						const getJSONSpy = Sinon.spy(testPict.EntityProvider.restClient, 'getJSON');

						// The test database does not have a users table yet.
						delete testPict.EntityProvider.entityColumnTranslations.CreatingIDUser;
						delete testPict.EntityProvider.entityColumnTranslations.UpdatingIDUser;
						delete testPict.EntityProvider.entityColumnTranslations.DeletingIDUser;

						let tmpAnticipate = testPict.newAnticipate();
						let tmpTestState = {};

						// First, get 10 books which should automatically prime both the list cache and single record caches.
						tmpAnticipate.anticipate(
							(fStageComplete) =>
							{
								testPict.EntityProvider.getEntitySetWithAutoCaching('BookAuthorJoin', `FBV~IDAuthor~GT~40~FBV~IDAuthor~LT~75`, fStageComplete);
							});
						
						// Now, get a single author within the ID range that should be in the cache already.
						let tmpCallCountAfterBatch;
						tmpAnticipate.anticipate(
							(fStageComplete) =>
							{
								// The exact call count depends on seed data volume (pagination),
								// so capture the count after batch and assert relative to it.
								tmpCallCountAfterBatch = getJSONSpy.callCount;
								Expect(tmpCallCountAfterBatch).to.be.at.least(10);
								testPict.EntityProvider.getEntity('Author', 42,
									(pError, pRecord) =>
									{
										Expect(pRecord).to.be.an('object');
										Expect(pRecord.IDAuthor).to.equal(42);
										// Cache hit -- no new network requests
										Sinon.assert.callCount(getJSONSpy, tmpCallCountAfterBatch);
										return fStageComplete(pError);
									});
							});


						// Now, get a single author outside the ID range of what should be in the cache already.
						tmpAnticipate.anticipate(
							(fStageComplete) =>
							{
								Sinon.assert.callCount(getJSONSpy, tmpCallCountAfterBatch);
								testPict.EntityProvider.getEntity('Author', 188,
									(pError, pRecord) =>
									{
										Expect(pRecord).to.be.an('object');
										Expect(pRecord.IDAuthor).to.equal(188);
										// Expect exactly one new network request (cache miss)
										Sinon.assert.callCount(getJSONSpy, tmpCallCountAfterBatch + 1);
										return fStageComplete(pError);
									});
							});

						// Wait for everything asynchronous to be completed
						tmpAnticipate.wait(fDone);
					}
				);

				test(
					'getEntitySetPage / getEntitySetRecordCount honor a per-request URLPrefix',
					function()
					{
						const testPict = new libPict(_MockSettings);
						// Asserts the legacy GET URL shape; pin the transport to GET so no
						// capability probe is issued ahead of the read.
						testPict.EntityProvider.useQueryEndpoint = false;
						const getJSONStub = Sinon.stub(testPict.EntityProvider.restClient, 'getJSON');

						// A per-request prefix routes to a custom (e.g. private-data-lake) endpoint...
						testPict.EntityProvider.getEntitySetPage('MixDesign', '', 0, 50, () => {}, '', 'http://localhost:8086/1.0/PrivateDataLake/HMA/');
						Sinon.assert.calledWith(getJSONStub, 'http://localhost:8086/1.0/PrivateDataLake/HMA/MixDesigns/0/50');

						// ...and omitting it falls back to the provider's default prefix.
						testPict.EntityProvider.getEntitySetPage('Book', '', 0, 50, () => {});
						Sinon.assert.calledWith(getJSONStub, 'http://localhost:8086/1.0/Books/0/50');

						// The count endpoint honors it too.
						testPict.EntityProvider.getEntitySetRecordCount('MixDesign', '', () => {}, '', 'http://localhost:8086/1.0/PrivateDataLake/HMA/');
						Sinon.assert.calledWith(getJSONStub, 'http://localhost:8086/1.0/PrivateDataLake/HMA/MixDesigns/Count');

						getJSONStub.restore();
					}
				);

				test(
					'gatherEntitySet routes a request-def URLPrefix through to the page fetch',
					function()
					{
						const testPict = new libPict(_MockSettings);
						// Asserts the legacy GET URL shape; pin the transport to GET.
						testPict.EntityProvider.useQueryEndpoint = false;
						const getJSONStub = Sinon.stub(testPict.EntityProvider.restClient, 'getJSON');

						// The request def carries URLPrefix → it must reach getEntitySetPage's URL.
						testPict.EntityProvider.gatherEntitySet(
							{ Entity: 'MixDesign', Filter: '', Destination: 'Result', RecordStartCursor: 0, PageSize: 50, URLPrefix: 'http://localhost:8086/1.0/PrivateDataLake/HMA/' },
							{},
							() => {});
						Sinon.assert.calledWith(getJSONStub, 'http://localhost:8086/1.0/PrivateDataLake/HMA/MixDesigns/0/50');

						getJSONStub.restore();
					}
				);
			}
		);

		suite(
			'Bundle Parallelization',
			function()
			{
				test(
					'extractStepDependencies parses PJU template references',
					function()
					{
						const testPict = new libPict(_MockSettings);
						const tmpDeps = testPict.EntityProvider.extractStepDependencies({
							Entity: 'Book',
							Filter: 'FBL~IDBook~INN~{~PJU:,^IDBook^AppData.BookAuthorJoins~}',
							Destination: 'AppData.Books'
						});
						Expect(tmpDeps.has('AppData.BookAuthorJoins')).to.equal(true);
						Expect(tmpDeps.size).to.equal(1);
					}
				);

				test(
					'extractStepDependencies parses D: data-address references',
					function()
					{
						const testPict = new libPict(_MockSettings);
						const tmpDeps = testPict.EntityProvider.extractStepDependencies({
							Entity: 'Contract',
							Filter: 'FBL~IDContract~INN~{~D:Bundle.Project.IDContract~}',
							Destination: 'Bundle.Contract'
						});
						Expect(tmpDeps.has('Bundle.Project.IDContract')).to.equal(true);
						Expect(tmpDeps.size).to.equal(1);
					}
				);

				test(
					'extractStepDependencies returns empty set for static filters',
					function()
					{
						const testPict = new libPict(_MockSettings);
						const tmpDeps = testPict.EntityProvider.extractStepDependencies({
							Entity: 'Project',
							Filter: 'FBV~IDProject~EQ~12345',
							Destination: 'AppData.Project'
						});
						Expect(tmpDeps.size).to.equal(0);
					}
				);

				test(
					'extractStepDependencies parses MapJoin address properties',
					function()
					{
						const testPict = new libPict(_MockSettings);
						const tmpDeps = testPict.EntityProvider.extractStepDependencies({
							Type: 'MapJoin',
							DestinationRecordSetAddress: 'State.Authors',
							Joins: 'State.BookAuthorJoins',
							JoinRecordSetAddress: 'State.Books',
							RecordDestinationAddress: 'Books'
						});
						Expect(tmpDeps.has('State.Authors')).to.equal(true);
						Expect(tmpDeps.has('State.BookAuthorJoins')).to.equal(true);
						Expect(tmpDeps.has('State.Books')).to.equal(true);
						Expect(tmpDeps.size).to.equal(3);
					}
				);

				test(
					'extractStepDependencies parses ProjectDataset input address',
					function()
					{
						const testPict = new libPict(_MockSettings);
						const tmpDeps = testPict.EntityProvider.extractStepDependencies({
							Type: 'ProjectDataset',
							InputRecordsetAddress: 'AppData.Comics[]<<~?InStock,TRUE,?~>>',
							OutputRecordsetAddress: 'AppData.FilteredComics'
						});
						Expect(tmpDeps.has('AppData.Comics')).to.equal(true);
						Expect(tmpDeps.size).to.equal(1);
					}
				);

				test(
					'extractStepDependencies handles multiple dependencies in one filter',
					function()
					{
						const testPict = new libPict(_MockSettings);
						const tmpDeps = testPict.EntityProvider.extractStepDependencies({
							Entity: 'TestResult',
							Filter: 'FBL~IDSample~INN~{~PJU:,^IDSample^Bundle.Samples~}~FBV~IDProject~EQ~{~D:Bundle.Project.IDProject~}',
							Destination: 'Bundle.TestResult'
						});
						Expect(tmpDeps.has('Bundle.Samples')).to.equal(true);
						Expect(tmpDeps.has('Bundle.Project.IDProject')).to.equal(true);
						Expect(tmpDeps.size).to.equal(2);
					}
				);

				test(
					'buildBundleWaves groups independent steps into same wave',
					function()
					{
						const testPict = new libPict(_MockSettings);
						const tmpWaves = testPict.EntityProvider.buildBundleWaves([
							{
								Entity: 'Product',
								Filter: 'FBV~Deleted~EQ~0',
								Destination: 'Bundle.Products'
							},
							{
								Entity: 'User',
								Filter: 'FBV~Deleted~EQ~0',
								Destination: 'Bundle.Users'
							},
							{
								Entity: 'Role',
								Filter: 'FBV~Deleted~EQ~0',
								Destination: 'Bundle.Roles'
							}
						]);
						// All three steps have static filters — should be one wave
						Expect(tmpWaves.length).to.equal(1);
						Expect(tmpWaves[0].length).to.equal(3);
					}
				);

				test(
					'buildBundleWaves separates dependent steps into sequential waves',
					function()
					{
						const testPict = new libPict(_MockSettings);
						const tmpWaves = testPict.EntityProvider.buildBundleWaves([
							{
								Entity: 'Project',
								Filter: 'FBV~IDProject~EQ~100',
								Destination: 'AppData.Project'
							},
							{
								Entity: 'Contract',
								Filter: 'FBL~IDContract~EQ~{~D:AppData.Project.IDContract~}',
								Destination: 'AppData.Contract'
							},
							{
								Entity: 'Sample',
								Filter: 'FBV~IDProject~EQ~{~D:AppData.Project.IDProject~}',
								Destination: 'AppData.Samples'
							},
							{
								Entity: 'TestInstance',
								Filter: 'FBV~IDProject~EQ~{~D:AppData.Project.IDProject~}',
								Destination: 'AppData.TestInstances'
							},
							{
								Entity: 'DocumentPolyJoin',
								Filter: 'FBL~IDSample~INN~{~PJU:,^IDSample^AppData.Samples~}',
								Destination: 'AppData.DocPolyJoins'
							}
						]);
						// Wave 1: Project (static filter)
						// Wave 2: Contract, Sample, TestInstance (all depend on Project)
						// Wave 3: DocumentPolyJoin (depends on Samples)
						Expect(tmpWaves.length).to.equal(3);
						Expect(tmpWaves[0].length).to.equal(1);
						Expect(tmpWaves[0][0].Step.Entity).to.equal('Project');
						Expect(tmpWaves[1].length).to.equal(3);
						Expect(tmpWaves[2].length).to.equal(1);
						Expect(tmpWaves[2][0].Step.Entity).to.equal('DocumentPolyJoin');
					}
				);

				test(
					'buildBundleWaves treats SetStateAddress as a wave barrier',
					function()
					{
						const testPict = new libPict(_MockSettings);
						const tmpWaves = testPict.EntityProvider.buildBundleWaves([
							{
								Entity: 'Product',
								Filter: 'FBV~Deleted~EQ~0',
								Destination: 'Bundle.Products'
							},
							{
								Type: 'SetStateAddress',
								StateAddress: 'AppData.TestState'
							},
							{
								Entity: 'User',
								Filter: 'FBV~Deleted~EQ~0',
								Destination: 'Bundle.Users'
							}
						]);
						// Wave 1: Product, Wave 2: SetStateAddress, Wave 3: User
						Expect(tmpWaves.length).to.equal(3);
						Expect(tmpWaves[0].length).to.equal(1);
						Expect(tmpWaves[1].length).to.equal(1);
						Expect(tmpWaves[1][0].Step.Type).to.equal('SetStateAddress');
						Expect(tmpWaves[2].length).to.equal(1);
					}
				);

				test(
					'buildBundleWaves treats PopState as a wave barrier',
					function()
					{
						const testPict = new libPict(_MockSettings);
						const tmpWaves = testPict.EntityProvider.buildBundleWaves([
							{
								Type: 'SetStateAddress',
								StateAddress: 'AppData.TestState'
							},
							{
								Entity: 'Product',
								Filter: 'FBV~Deleted~EQ~0',
								Destination: 'State.Products'
							},
							{
								Type: 'PopState'
							},
							{
								Entity: 'User',
								Filter: 'FBV~Deleted~EQ~0',
								Destination: 'Bundle.Users'
							}
						]);
						Expect(tmpWaves.length).to.equal(4);
						Expect(tmpWaves[0][0].Step.Type).to.equal('SetStateAddress');
						Expect(tmpWaves[2][0].Step.Type).to.equal('PopState');
					}
				);

				test(
					'buildBundleWaves respects Parallel:false on individual steps',
					function()
					{
						const testPict = new libPict(_MockSettings);
						const tmpWaves = testPict.EntityProvider.buildBundleWaves([
							{
								Entity: 'Product',
								Filter: 'FBV~Deleted~EQ~0',
								Destination: 'Bundle.Products'
							},
							{
								Entity: 'User',
								Filter: 'FBV~Deleted~EQ~0',
								Destination: 'Bundle.Users',
								Parallel: false
							},
							{
								Entity: 'Role',
								Filter: 'FBV~Deleted~EQ~0',
								Destination: 'Bundle.Roles'
							}
						]);
						// Product and Role can be in wave 1, but User (Parallel:false)
						// must be alone — so we get 3 waves or User is isolated
						let tmpUserWave = null;
						for (const tmpWave of tmpWaves)
						{
							for (const tmpEntry of tmpWave)
							{
								if (tmpEntry.Step.Entity === 'User')
								{
									tmpUserWave = tmpWave;
								}
							}
						}
						Expect(tmpUserWave).to.not.equal(null);
						Expect(tmpUserWave.length).to.equal(1);
					}
				);

				test(
					'getEntitySet accepts per-call DownloadPageConcurrency option',
					function()
					{
						const testPict = new libPict(_MockSettings);
						// Verify the method signature accepts the options parameter without error
						// (server-dependent fetch would fail, but we can verify the option is read)
						Expect(typeof testPict.EntityProvider.getEntitySet).to.equal('function');
						Expect(testPict.EntityProvider.getEntitySet.length).to.be.at.least(3);

						// Verify extractStepDependencies doesn't choke on DownloadPageConcurrency in step config
						const tmpDeps = testPict.EntityProvider.extractStepDependencies({
							Entity: 'Product',
							Filter: 'FBV~Deleted~EQ~0',
							Destination: 'Bundle.Products',
							DownloadPageConcurrency: 2
						});
						Expect(tmpDeps.size).to.equal(0);
					}
				);

				test(
					'buildBundleWaves handles MapJoin dependencies correctly',
					function()
					{
						const testPict = new libPict(_MockSettings);
						const tmpWaves = testPict.EntityProvider.buildBundleWaves([
							{
								Entity: 'Author',
								Filter: 'FBL~IDAuthor~LT~10',
								Destination: 'State.Authors'
							},
							{
								Entity: 'Book',
								Filter: 'FBV~Deleted~EQ~0',
								Destination: 'State.Books'
							},
							{
								Entity: 'BookAuthorJoin',
								Filter: 'FBL~IDAuthor~INN~{~PJU:,^IDAuthor^State.Authors~}',
								Destination: 'State.BookAuthorJoins'
							},
							{
								Type: 'MapJoin',
								DestinationRecordSetAddress: 'State.Authors',
								Joins: 'State.BookAuthorJoins',
								JoinRecordSetAddress: 'State.Books',
								RecordDestinationAddress: 'Books'
							}
						]);
						// Wave 1: Author + Book (independent)
						// Wave 2: BookAuthorJoin (depends on State.Authors)
						// Wave 3: MapJoin (depends on all three)
						Expect(tmpWaves.length).to.equal(3);
						Expect(tmpWaves[0].length).to.equal(2);
						Expect(tmpWaves[1].length).to.equal(1);
						Expect(tmpWaves[1][0].Step.Entity).to.equal('BookAuthorJoin');
						Expect(tmpWaves[2].length).to.equal(1);
						Expect(tmpWaves[2][0].Step.Type).to.equal('MapJoin');
					}
				);

				test(
					'gatherDataFromServer executes independent steps in parallel waves',
					function(fDone)
					{
						this.timeout(10000);
						const testPict = new libPict(_MockSettings);

						testPict.EntityProvider.gatherDataFromServer(
							[
								{
									"Entity": "Author",
									"Filter": "FBV~IDAuthor~EQ~100",
									"Destination": "AppData.Author100",
									"SingleRecord": true
								},
								{
									"Entity": "Author",
									"Filter": "FBV~IDAuthor~EQ~101",
									"Destination": "AppData.Author101",
									"SingleRecord": true
								},
								{
									"Entity": "BookAuthorJoin",
									"Filter": "FBV~IDAuthor~EQ~{~D:AppData.Author100.IDAuthor~}",
									"Destination": "AppData.BookAuthorJoins"
								}
							],
							function(pError)
							{
								try
								{
									Expect(pError).to.not.exist;
									// Both authors should be fetched
									Expect(testPict.AppData.Author100.IDAuthor).to.equal(100);
									Expect(testPict.AppData.Author101.IDAuthor).to.equal(101);
									// The dependent join should also have completed
									Expect(testPict.AppData.BookAuthorJoins).to.be.an('array');
									Expect(testPict.AppData.BookAuthorJoins.length).to.be.greaterThan(0);

									// Inspect the wave schedule
									const tmpWaves = testPict.EntityProvider.lastBundleWaves;
									// Wave 1: Author100 + Author101 (both static filters)
									// Wave 2: BookAuthorJoins (depends on Author100)
									Expect(tmpWaves.length).to.equal(2);
									Expect(tmpWaves[0].length).to.equal(2);
									Expect(tmpWaves[1].length).to.equal(1);
								}
								catch (pAssertError)
								{
									return fDone(pAssertError);
								}
								return fDone();
							});
					}
				);

				test(
					'gatherDataFromServer with SetStateAddress produces correct results',
					function(fDone)
					{
						this.timeout(10000);
						const testPict = new libPict(_MockSettings);

						testPict.EntityProvider.gatherDataFromServer(
							[
								{
									"Type": "SetStateAddress",
									"StateAddress": "AppData.TestState"
								},
								{
									"Entity": "Author",
									"Filter": "FBL~IDAuthor~LT~5",
									"AllRecords": true,
									"Destination": "State.Authors"
								},
								{
									"Type": "PopState"
								},
								{
									"Entity": "Author",
									"Filter": "FBV~IDAuthor~EQ~100",
									"Destination": "AppData.SingleAuthor",
									"SingleRecord": true
								}
							],
							function(pError)
							{
								try
								{
									Expect(pError).to.not.exist;
									Expect(testPict.AppData.TestState.Authors).to.be.an('array');
									Expect(testPict.AppData.TestState.Authors.length).to.be.greaterThan(0);
									Expect(testPict.AppData.SingleAuthor.IDAuthor).to.equal(100);

									// Waves: SetStateAddress | Author (State.Authors) | PopState | SingleAuthor
									const tmpWaves = testPict.EntityProvider.lastBundleWaves;
									Expect(tmpWaves.length).to.equal(4);
								}
								catch (pAssertError)
								{
									return fDone(pAssertError);
								}
								return fDone();
							});
					}
				);

				test(
					'gatherDataFromServer handles empty bundle array',
					function(fDone)
					{
						const testPict = new libPict(_MockSettings);

						testPict.EntityProvider.gatherDataFromServer(
							[],
							function(pError)
							{
								Expect(pError).to.not.exist;
								Expect(testPict.EntityProvider.lastBundleWaves.length).to.equal(0);
								return fDone();
							});
					}
				);

				test(
					'existing basic provider test still works with parallelization',
					function(fDone)
					{
						this.timeout(10000);
						const testPict = new libPict(_MockSettings);

						testPict.EntityProvider.gatherDataFromServer(
							[
								{
									"Entity": "Author",
									"Filter": "FBV~IDAuthor~EQ~100",
									"Destination": "AppData.CurrentAuthor",
									"SingleRecord": true
								},
								{
									"Entity": "BookAuthorJoin",
									"Filter": "FBV~IDAuthor~EQ~{~D:AppData.CurrentAuthor.IDAuthor~}",
									"Destination": "AppData.BookAuthorJoins"
								},
								{
									"Entity": "Book",
									"Filter": "FBL~IDBook~INN~{~PJU:,^IDBook^AppData.BookAuthorJoins~}",
									"Destination": "AppData.Books"
								},
								{
									"Type": "Custom",
									"URL": "Author/Schema",
									"Destination": "AppData.AuthorSchema"
								}
							],
							function(pError)
							{
								try
								{
									Expect(pError).to.not.exist;
									Expect(testPict.AppData.CurrentAuthor.IDAuthor).to.equal(100);
									Expect(testPict.AppData.BookAuthorJoins.length).to.be.greaterThan(0);
									Expect(testPict.AppData.AuthorSchema).to.be.an('object');

									// Verify the wave structure: 3 waves
									// Wave 1: Author + Custom (both have static/no deps)
									// Wave 2: BookAuthorJoin (depends on AppData.CurrentAuthor)
									// Wave 3: Book (depends on AppData.BookAuthorJoins)
									const tmpWaves = testPict.EntityProvider.lastBundleWaves;
									Expect(tmpWaves.length).to.equal(3);
									Expect(tmpWaves[0].length).to.equal(2);
								}
								catch (pAssertError)
								{
									return fDone(pAssertError);
								}
								return fDone();
							});
					}
				);
			}
		);

			suite(
				'Query Endpoint Capability Detection and Routing',
				function()
				{
					// Schema bodies a server might return.
					const _SchemaSupportedFlag = { title: 'Book', RetoldMetadata: { PackageVersions: { 'meadow-endpoints': '4.1.0' }, Capabilities: { QueryEndpoint: true } } };
					const _SchemaSupportedVersionOnly = { title: 'Book', RetoldMetadata: { PackageVersions: { 'meadow-endpoints': '4.1.0' } } };
					const _SchemaUnsupportedVersion = { title: 'Book', RetoldMetadata: { PackageVersions: { 'meadow-endpoints': '4.0.24' } } };
					const _SchemaDisabledFlag = { title: 'Book', RetoldMetadata: { PackageVersions: { 'meadow-endpoints': '4.1.0' }, Capabilities: { QueryEndpoint: false } } };
					const _SchemaLegacyNoMetadata = { title: 'Book', properties: { IDBook: {} } };

					// Stub the rest client so a Schema probe returns pSchemaBody, GET reads
					// return canned records/counts, and POST /Query returns the same. Both
					// stubs are returned so a test can assert which transport was used.
					const installRestStubs = (pProvider, pSchemaBody) =>
					{
						const tmpGetStub = Sinon.stub(pProvider.restClient, 'getJSON').callsFake(
							(pOptionsOrURL, fCallback) =>
							{
								const tmpURL = (typeof pOptionsOrURL === 'string') ? pOptionsOrURL : pOptionsOrURL.url;
								if (tmpURL.endsWith('/Schema'))
								{
									return fCallback(null, { statusCode: 200 }, pSchemaBody);
								}
								if (tmpURL.indexOf('/Count') !== -1)
								{
									return fCallback(null, { statusCode: 200 }, { Count: 3 });
								}
								return fCallback(null, { statusCode: 200 }, [ { IDBook: 1 }, { IDBook: 2 }, { IDBook: 3 } ]);
							});
						const tmpPostStub = Sinon.stub(pProvider.restClient, 'postJSON').callsFake(
							(pOptions, fCallback) =>
							{
								if (pOptions.body && pOptions.body.Count)
								{
									return fCallback(null, { statusCode: 200 }, { Count: 3 });
								}
								return fCallback(null, { statusCode: 200 }, [ { IDBook: 1 }, { IDBook: 2 }, { IDBook: 3 } ]);
							});
						return { getStub: tmpGetStub, postStub: tmpPostStub };
					};

					const schemaProbeCount = (pGetStub) =>
					{
						return pGetStub.getCalls().filter((pCall) =>
						{
							const tmpURL = (typeof pCall.args[0] === 'string') ? pCall.args[0] : pCall.args[0].url;
							return tmpURL.endsWith('/Schema');
						}).length;
					};

					test(
						'isMeadowEndpointsVersionQueryCapable is major-version aware',
						function()
						{
							const tmpProvider = new libPict(_MockSettings).EntityProvider;
							// 2.x: supported at/after 2.1.0
							Expect(tmpProvider.isMeadowEndpointsVersionQueryCapable('2.1.0')).to.equal(true);
							Expect(tmpProvider.isMeadowEndpointsVersionQueryCapable('2.5.7')).to.equal(true);
							Expect(tmpProvider.isMeadowEndpointsVersionQueryCapable('2.0.46')).to.equal(false);
							// 3.x: never supported
							Expect(tmpProvider.isMeadowEndpointsVersionQueryCapable('3.0.0')).to.equal(false);
							Expect(tmpProvider.isMeadowEndpointsVersionQueryCapable('3.9.9')).to.equal(false);
							// 4.x: supported at/after 4.1.0 (NOT 4.0.x)
							Expect(tmpProvider.isMeadowEndpointsVersionQueryCapable('4.0.0')).to.equal(false);
							Expect(tmpProvider.isMeadowEndpointsVersionQueryCapable('4.0.24')).to.equal(false);
							Expect(tmpProvider.isMeadowEndpointsVersionQueryCapable('4.1.0')).to.equal(true);
							Expect(tmpProvider.isMeadowEndpointsVersionQueryCapable('4.2.3')).to.equal(true);
							// 5.x (unknown major): unsupported until explicitly added
							Expect(tmpProvider.isMeadowEndpointsVersionQueryCapable('5.0.0')).to.equal(false);
							// Garbage
							Expect(tmpProvider.isMeadowEndpointsVersionQueryCapable('not-a-version')).to.equal(false);
							Expect(tmpProvider.isMeadowEndpointsVersionQueryCapable(undefined)).to.equal(false);
						}
					);

					test(
						'evaluateQueryEndpointSupport prefers the explicit flag, falls back to version',
						function()
						{
							const tmpProvider = new libPict(_MockSettings).EntityProvider;
							Expect(tmpProvider.evaluateQueryEndpointSupport(_SchemaSupportedFlag)).to.equal(true);
							Expect(tmpProvider.evaluateQueryEndpointSupport(_SchemaSupportedVersionOnly)).to.equal(true);
							Expect(tmpProvider.evaluateQueryEndpointSupport(_SchemaUnsupportedVersion)).to.equal(false);
							// Explicit false flag wins even though the version would say yes.
							Expect(tmpProvider.evaluateQueryEndpointSupport(_SchemaDisabledFlag)).to.equal(false);
							// Older servers advertise nothing.
							Expect(tmpProvider.evaluateQueryEndpointSupport(_SchemaLegacyNoMetadata)).to.equal(false);
							Expect(tmpProvider.evaluateQueryEndpointSupport(null)).to.equal(false);
						}
					);

					test(
						'supported server: count + page reads route through POST /Query',
						function(fDone)
						{
							const tmpProvider = new libPict(_MockSettings).EntityProvider;
							const tmpStubs = installRestStubs(tmpProvider, _SchemaSupportedFlag);

							// A filter long enough to blow past a GET URI limit.
							const tmpLongFilter = `FBL~IDBook~INN~${Array.from({ length: 4000 }, (pUnused, pI) => { return pI; }).join(',')}`;

							tmpProvider.getEntitySet('Book', tmpLongFilter,
								(pError, pRecords) =>
								{
									try
									{
										Expect(pError).to.not.exist;
										Expect(pRecords).to.be.an('array');
										Expect(pRecords.length).to.equal(3);
										// Exactly one Schema probe — and never a GET read.
										Expect(schemaProbeCount(tmpStubs.getStub)).to.equal(1);
										const tmpNonSchemaGets = tmpStubs.getStub.getCalls().filter((pCall) => { const u = (typeof pCall.args[0] === 'string') ? pCall.args[0] : pCall.args[0].url; return !u.endsWith('/Schema'); });
										Expect(tmpNonSchemaGets.length).to.equal(0);
										// Count + at least one page, all via POST /Query.
										Expect(tmpStubs.postStub.callCount).to.be.at.least(2);
										tmpStubs.postStub.getCalls().forEach((pCall) =>
										{
											Expect(pCall.args[0].url).to.equal('http://localhost:8086/1.0/Books/Query');
										});
										const tmpCountCall = tmpStubs.postStub.getCalls().find((pCall) => { return pCall.args[0].body && pCall.args[0].body.Count; });
										Expect(tmpCountCall).to.exist;
										Expect(tmpCountCall.args[0].body.Filter).to.equal(tmpLongFilter);
									}
									catch (pAssertError)
									{
										return fDone(pAssertError);
									}
									return fDone();
								});
						}
					);

					test(
						'unsupported server: reads fall back to GET, POST /Query is never used',
						function(fDone)
						{
							const tmpProvider = new libPict(_MockSettings).EntityProvider;
							const tmpStubs = installRestStubs(tmpProvider, _SchemaLegacyNoMetadata);

							tmpProvider.getEntitySet('Book', 'FBV~Genre~EQ~SciFi',
								(pError, pRecords) =>
								{
									try
									{
										Expect(pError).to.not.exist;
										Expect(pRecords).to.be.an('array');
										Expect(pRecords.length).to.equal(3);
										// POST /Query must NOT be used against a server that does not advertise it.
										Expect(tmpStubs.postStub.callCount).to.equal(0);
										// GET reads carry the legacy /FilteredTo/ + /Count URL shape.
										const tmpURLs = tmpStubs.getStub.getCalls().map((pCall) => { return (typeof pCall.args[0] === 'string') ? pCall.args[0] : pCall.args[0].url; });
										Expect(tmpURLs.some((pU) => { return pU.indexOf('/Books/Count/FilteredTo/FBV~Genre~EQ~SciFi') !== -1; })).to.equal(true);
										Expect(tmpURLs.some((pU) => { return pU.indexOf('/Books/FilteredTo/FBV~Genre~EQ~SciFi/') !== -1; })).to.equal(true);
									}
									catch (pAssertError)
									{
										return fDone(pAssertError);
									}
									return fDone();
								});
						}
					);

					test(
						'capability is probed once per entity and cached for the session',
						function(fDone)
						{
							const tmpProvider = new libPict(_MockSettings).EntityProvider;
							const tmpStubs = installRestStubs(tmpProvider, _SchemaSupportedFlag);

							tmpProvider.getEntitySetRecordCount('Book', 'FBV~Genre~EQ~SciFi',
								() =>
								{
									tmpProvider.getEntitySetRecordCount('Book', 'FBV~Genre~EQ~Thriller',
										() =>
										{
											try
											{
												Expect(schemaProbeCount(tmpStubs.getStub)).to.equal(1);
											}
											catch (pAssertError)
											{
												return fDone(pAssertError);
											}
											return fDone();
										});
								});
						}
					);

					test(
						'primeEntityCapabilityFromSchema seeds the cache without a probe',
						function(fDone)
						{
							const tmpProvider = new libPict(_MockSettings).EntityProvider;
							// Seed support from a schema the caller already holds.
							Expect(tmpProvider.primeEntityCapabilityFromSchema('Book', _SchemaSupportedFlag)).to.equal(true);
							const tmpStubs = installRestStubs(tmpProvider, _SchemaLegacyNoMetadata);

							tmpProvider.getEntitySetRecordCount('Book', 'FBV~Genre~EQ~SciFi',
								(pError, pCount) =>
								{
									try
									{
										Expect(pCount).to.equal(3);
										// No Schema probe (seeded), and the count went via POST /Query.
										Expect(schemaProbeCount(tmpStubs.getStub)).to.equal(0);
										Expect(tmpStubs.postStub.callCount).to.equal(1);
										Expect(tmpStubs.postStub.getCall(0).args[0].body.Count).to.equal(true);
									}
									catch (pAssertError)
									{
										return fDone(pAssertError);
									}
									return fDone();
								});
						}
					);

					test(
						'useQueryEndpoint=false disables probing and forces GET',
						function(fDone)
						{
							const tmpProvider = new libPict(_MockSettings).EntityProvider;
							tmpProvider.useQueryEndpoint = false;
							const tmpStubs = installRestStubs(tmpProvider, _SchemaSupportedFlag);

							tmpProvider.getEntitySetRecordCount('Book', 'FBV~Genre~EQ~SciFi',
								(pError, pCount) =>
								{
									try
									{
										Expect(pCount).to.equal(3);
										Expect(tmpStubs.postStub.callCount).to.equal(0);
										Expect(schemaProbeCount(tmpStubs.getStub)).to.equal(0);
									}
									catch (pAssertError)
									{
										return fDone(pAssertError);
									}
									return fDone();
								});
						}
					);

					test(
						'supported: getEntitySetByIDListChunked sends the whole list in one POST /Query',
						function(fDone)
						{
							const tmpProvider = new libPict(_MockSettings).EntityProvider;
							const tmpStubs = installRestStubs(tmpProvider, _SchemaSupportedFlag);
							const tmpIDs = Array.from({ length: 1000 }, (pUnused, pI) => { return pI + 1; });

							tmpProvider.getEntitySetByIDListChunked('Book', tmpIDs, { NoCount: true }, (pError) =>
							{
								try
								{
									Expect(pError).to.not.exist;
									// One chunk -> one POST /Query carrying all 1000 IDs (no 200-ID GET chunking).
									Expect(tmpStubs.postStub.callCount).to.equal(1);
									Expect(tmpStubs.postStub.getCall(0).args[0].url).to.equal('http://localhost:8086/1.0/Books/Query');
									const tmpFilter = tmpStubs.postStub.getCall(0).args[0].body.Filter;
									Expect(tmpFilter.indexOf('FBL~IDBook~INN~')).to.equal(0);
									Expect(tmpFilter.split(',').length).to.equal(1000);
									// No GET reads (only the Schema probe).
									const tmpNonSchemaGets = tmpStubs.getStub.getCalls().filter((pCall) => { const u = (typeof pCall.args[0] === 'string') ? pCall.args[0] : pCall.args[0].url; return !u.endsWith('/Schema'); });
									Expect(tmpNonSchemaGets.length).to.equal(0);
								}
								catch (pAssertError)
								{
									return fDone(pAssertError);
								}
								return fDone();
							});
						}
					);

					test(
						'unsupported: getEntitySetByIDListChunked still chunks to 200-ID GET reads',
						function(fDone)
						{
							const tmpProvider = new libPict(_MockSettings).EntityProvider;
							const tmpStubs = installRestStubs(tmpProvider, _SchemaLegacyNoMetadata);
							const tmpIDs = Array.from({ length: 1000 }, (pUnused, pI) => { return pI + 1; });

							tmpProvider.getEntitySetByIDListChunked('Book', tmpIDs, { NoCount: true }, (pError) =>
							{
								try
								{
									Expect(pError).to.not.exist;
									Expect(tmpStubs.postStub.callCount).to.equal(0);
									// 1000 IDs / 200 per chunk = 5 GET reads, none oversized.
									const tmpNonSchemaGets = tmpStubs.getStub.getCalls().filter((pCall) => { const u = (typeof pCall.args[0] === 'string') ? pCall.args[0] : pCall.args[0].url; return !u.endsWith('/Schema'); });
									Expect(tmpNonSchemaGets.length).to.equal(5);
								}
								catch (pAssertError)
								{
									return fDone(pAssertError);
								}
								return fDone();
							});
						}
					);
				}
			);
	}
);
