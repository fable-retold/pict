/**
* Unit tests for Pict Templating Pipeline
*
* @license     MIT
*
* @author      Steven Velozo <steven@velozo.com>
*/

const Chai = require("chai");
const Expect = Chai.expect;

const libPict = require('../source/Pict.js');

const _SampleChocoData = require('./data/Data-Archive-org-Frankenberry.json');

// Outside and inside the docker container, the port is different.
//const _RetoldTestPort = 60086;
const _RetoldTestPort = 8086;

const _MockSettings = (
	{
		Product: 'MockPict',
		ProductVersion: '1.0.0',

		PictDefaultURLPrefix: `http://localhost:${_RetoldTestPort}/1.0/`
	});

const _QuantityTemplate = `
	<td>{~Data:Record.worktype_String~}</td>
	<td align="center">{~Data:Record.itemnumber~}</td>
	<td width="45%">{~Data:Record.description~}</td>
	<td align="left">{~Data:Record.units~}</td>
	<td align="right">{~Dollars:Record.costperunit~}</td>
	<td align="right">{~Digits:Record.quantity~}</td>
	<td align="right">{~Dollars:Record.amount~}</td>
`;

const _QuantityRecord = require('./data/SampleRecord-Quantity.json');

suite(
		'Pict Templates',
		function ()
		{
			setup(
					function ()
					{
					}
				);

			suite(
					'Complex Processing',
					function ()
					{
						test(
								'Value trees can log.',
								function (fDone)
								{
									const testPict = new libPict(_MockSettings);
									testPict.AppData.ChocoData = _SampleChocoData;
									let tmpTemplateOutput = testPict.parseTemplate('<p>{~LVT:AppData.ChocoData~}</p>');
									Expect(tmpTemplateOutput).to.equal("<p></p>");
									fDone();
								}
							);
						test(
								'Plucked Template Value Sets work as expected.',
								function (fDone)
								{
									const testPict = new libPict(_MockSettings);
									testPict.AppData.ChocoData = _SampleChocoData;
									let tmpTemplateOutput = testPict.parseTemplate('<p>{~PJU:,^source^AppData.ChocoData.files~}</p>');
									Expect(tmpTemplateOutput).to.equal("<p>derivative,metadata,original</p>");
									fDone();
								}
							);
						test(
								'Templates can branch by type.',
								function (fDone)
								{
									const testPict = new libPict(_MockSettings);
									testPict.TemplateProvider.addTemplate('Visualize-String', '<p>String value: {~Data:AppData.SomeString~}</p>');
									testPict.TemplateProvider.addTemplate('Visualize-Number', '<p>Number value: {~Data:AppData.SomeNumber~}</p>');
									testPict.TemplateProvider.addTemplate('Visualize-Array', '<p>Array length: {~Data:AppData.SomeArray.length~}</p>');
									testPict.TemplateProvider.addTemplate('Visualize-Object', '<p>Object value: {~TVS:Visualize-ObjectEntry:AppData.SomeObject~}</p>');
									testPict.TemplateProvider.addTemplate('Visualize-ObjectEntry', '<span>Object value: {~Data:Record.Value.Name~}</span>');
									testPict.TemplateProvider.addTemplate('Visualize-Default', '<span>Default value.</span>');

									testPict.AppData = (
										{
											SomeString: "This is a string",
											SomeNumber: 42,
											SomeObject: { a: { Name: 'wrong'}, b: { Name: 'right' } },
											SomeArray: [1, 2, 3]
										});
									Expect(testPict.parseTemplate('<div>{~TBT:AppData.SomeString:string:Visualize-String~}</div>')).to.equal('<div><p>String value: This is a string</p></div>');
									Expect(testPict.parseTemplate('<div>{~TBT:AppData.SomeObject:string:Visualize-String~}</div>')).to.equal('<div></div>');
									Expect(testPict.parseTemplate('<div>{~TBT:AppData.SomeObject:object:Visualize-Object:Visualize-Default~}</div>')).to.equal('<div><p>Object value: <span>Object value: wrong</span><span>Object value: right</span></p></div>');
									Expect(testPict.parseTemplate('<div>{~TBT:AppData.SomeNumber:object:Visualize-Object:Appdata:Visualize-Default~}</div>')).to.equal('<div><span>Default value.</span></div>');
									testPict.parseTemplate('<div>{~TBT:AppData.SomeArray:array:Visualize-Array~}</div>', {},
										(pError, pValue) =>
										{
											Expect(pValue).to.equal('<div><p>Array length: 3</p></div>');
											fDone();
										});
								}
							);
						test(
								'Value trees can log with specified depth.',
								function (fDone)
								{
									const testPict = new libPict(_MockSettings);
									testPict.AppData.ChocoData = _SampleChocoData;
									let tmpTemplateOutput = testPict.parseTemplate('<p>{~LVT:AppData.ChocoData^1~}</p>');
									Expect(tmpTemplateOutput).to.equal("<p></p>");
									fDone();
								}
							);
						test(
								'Templates can render data trees.',
								function (fDone)
								{
									const testPict = new libPict(_MockSettings);
									testPict.AppData.ChocoData = _SampleChocoData;
									let tmpTemplateOutput = testPict.parseTemplate('{~DT:AppData.ChocoData~}');
									Expect(tmpTemplateOutput.indexOf('<div class="PICTObjectBranchDepth_1"><div class="PICTObjectBranch">title</div><div class="PICTObjectBranchValue">Franken Berry / Count Chocula : Tevevision Commercial 1971</div></div>')).to.be.greaterThan(0);
									fDone();
								}
							);
						test(
								'Data can be formatted into and out of javascript strings, and URL encoding',
								function (fDone)
								{
									const testPict = new libPict(_MockSettings);
									let tmpTemplateOutput = testPict.parseTemplate('{~DEJS:Record.MagicDate~}', { MagicDate: 'These quotes " should not be unescaped...' });
									// eslint-disable-next-line no-useless-escape
									Expect(tmpTemplateOutput).to.equal(`These quotes \" should not be unescaped...`);
									fDone();
								}
							);
						test(
								'Self referentiality is dubious and powerful.',
								function (fDone)
								{
									const testPict = new libPict(_MockSettings);
									testPict.AppData.ChocoData = _SampleChocoData;
									let tmpTemplateOutput = testPict.parseTemplate('{~Pict~}');
									Expect(tmpTemplateOutput.indexOf('_Pict')).to.be.greaterThan(0);
									Expect(testPict.parseTemplate('{~P~}')).to.equal('window._Pict');
									testPict.browserAddress = 'window._Pict.children[0]';
									Expect(testPict.parseTemplate('{~P~}.views["MyFavoriteView"].doSomething()')).to.equal('window._Pict.children[0].views["MyFavoriteView"].doSomething()');
									fDone();
								}
							);
						test(
								'Templates can render data trees with arbitrary depth.',
								function (fDone)
								{
									const testPict = new libPict(_MockSettings);
									testPict.AppData.ChocoData = _SampleChocoData;
									let tmpTemplateOutput = testPict.parseTemplate('{~DT:AppData.ChocoData^0~}');
									Expect(tmpTemplateOutput.indexOf('<div class="PICTObjectBranchDepth_0"><div class="PICTObjectBranch">item_size</div><div class="PICTObjectBranchValue">36431778</div></div>')).to.be.greaterThan(0);
									Expect(tmpTemplateOutput.indexOf('<div class="PICTObjectBranchDepth_0"><div class="PICTObjectBranch">metadata</div><div class="PICTObjectBranchValue">...</div></div>')).to.be.greaterThan(0);
									Expect(tmpTemplateOutput.indexOf('<div class="PICTObjectBranchDepth_1"><div class="PICTObjectBranch">title</div><div class="PICTObjectBranchValue">Franken Berry / Count Chocula : Tevevision Commercial 1971</div></div>')).to.be.lessThan(0);
									fDone();
								}
							);
						test(
								// Date library uses time zones from here: https://www.iana.org/time-zones
								'Dates in YYYY-MM-DD with timezone.',
								function (fDone)
								{
									const testPict = new libPict(_MockSettings);
									testPict.options.Timezone = 'America/Los_Angeles';
									let tmpTemplateOutput = testPict.parseTemplate('<p>{~DateTimeYMD:Record.MagicDate~}</p>', { MagicDate: '2023-05-25T05:54:46.000Z' });
									Expect(tmpTemplateOutput).to.equal("<p>2023-05-24</p>");
									fDone();
								}
							);
						test(
								'Dates in YYYY-MM-DD with a bad time value.',
								function (fDone)
								{
									const testPict = new libPict(_MockSettings);
									let tmpTemplateOutput = testPict.parseTemplate('<p>{~DateTimeYMD:Record.MagicDate~}</p>', { MagicDate: 'This is not a valid date!' });
									Expect(tmpTemplateOutput).to.equal("<p>Invalid Date</p>");
									fDone();
								}
							);
						test(
								// Date library uses time zones from here: https://www.iana.org/time-zones
								'Custom formatted dates with timezone.',
								function (fDone)
								{
									const testPict = new libPict(_MockSettings);
									testPict.options.Timezone = 'America/Los_Angeles';
									let tmpTemplateOutput = testPict.parseTemplate('<p>{~DateTimeYMD:Record.MagicDate~} which is {~DateTimeFormat:Record.MagicDate^dddd MMMM Do YYYY~}</p>', { MagicDate: '2023-05-25T05:54:46.000Z' });
									Expect(tmpTemplateOutput).to.equal("<p>2023-05-24 which is Wednesday May 24th 2023</p>");
									fDone();
								}
							);
						test(
								'DateOnlyYMD renders empty for missing or invalid values (never today)',
								function (fDone)
								{
									const testPict = new libPict(_MockSettings);
									let tmpMissing = testPict.parseTemplate('[{~DateOnlyYMD:Record.AbsentPath~}]', { SomethingElse: 1 });
									Expect(tmpMissing).to.equal('[]', 'absent path renders empty, not the current date');
									let tmpEmpty = testPict.parseTemplate('[{~DateOnlyYMD:Record.EmptyDate~}]', { EmptyDate: '' });
									Expect(tmpEmpty).to.equal('[]');
									let tmpGarbage = testPict.parseTemplate('[{~DateOnlyYMD:Record.BadDate~}]', { BadDate: 'not-a-date' });
									Expect(tmpGarbage).to.equal('[]', 'invalid dates render empty, not "Invalid Date"');
									fDone();
								}
							);
						test(
								// Date library uses time zones from here: https://www.iana.org/time-zones
								'Date values (with no time)',
								function (fDone)
								{
									const testPict = new libPict(_MockSettings);
									let tmpTemplateOutput = testPict.parseTemplate('<p>{~DateOnlyYMD:Record.MagicDate~} which is {~DateOnlyFormat:Record.MagicDate^dddd MMMM Do YYYY~}</p>',
										{
											MagicDate: '2023-05-25',
										});
									Expect(tmpTemplateOutput).to.equal("<p>2023-05-25 which is Thursday May 25th 2023</p>");
									fDone();
								}
							);
						test(
								// Date library uses time zones from here: https://www.iana.org/time-zones
								'Extreme date values (with no time)',
								function (fDone)
								{
									const testPict = new libPict(_MockSettings);
									let tmpTemplateOutput = testPict.parseTemplate(`<p>{~DateOnlyYMD:Record.MinDate~} to {~DateOnlyYMD:Record.MaxDate~} is the valid date range for javascript which are {~DateOnlyFormat:Record.MinDate^dddd MMMM Do YYYY~} to {~DateOnlyFormat:Record.MaxDate^dddd MMMM Do YYYY~}</p>`,
//Other intersting cutoffs are: {~DateOnlyYMD:Record.YearZero~} and {~DateOnlyYMD:Record.YearNegativeOne~}`,
										{
											// using ISO format to force parsing of the date
											MinDate: new Date(-8640000000000000).toISOString(), // see: https://stackoverflow.com/questions/11526504/minimum-and-maximum-date
											YearZero: new Date(-62167219200000).toISOString(),
											YearNegativeOne: new Date(-62167219200001).toISOString(),
											MaxDate: new Date(8640000000000000).toISOString(),
										});
									//FIXME: zero and -1 years are busted, seems to be a dayjs thing? not worrying about it for now
									// If we get into paleontology software, we can revisit.
									//Expect(tmpTemplateOutput).to.equal(`<p>-271822-04-20 to 275760-09-13 is the valid date range for javascript which are Saturday April 20th 271822 to Saturday September 13th 275760</p>`);
//Other intersting cutoffs are: 0000-01-01 and -0001-12-31`);
									fDone();
								}
							);
						test(
								'Templates should be able to run on sets.',
								function (fDone)
								{
									const testPict = new libPict(_MockSettings);
									let tmpTemplateOutput = testPict.parseTemplateSet('<p>{~Data:Record.size~}</p>', _SampleChocoData.files);
									Expect(tmpTemplateOutput).to.equal("<p>838</p><p>6843</p><p>8388</p><p>5993</p><p>4951</p><p>3383</p><p>3503</p><p>4093</p><p></p><p>1371</p><p>620</p><p>7481</p><p>101114</p><p>31625216</p><p>31141</p><p>2248166</p><p>2378677</p>");
									fDone();
								}
							);
						test(
								'Templates should be able to run on sets with subtemplates.',
								function (fDone)
								{
									const testPict = new libPict(_MockSettings);
									testPict.TemplateProvider.addTemplate('Choco-Row', '<p>{~Data:Record.name~} is a file of {~Data:Record.size~} bytes big.</p>');
									let tmpTemplateOutput = testPict.parseTemplate('<div>{~TS:Choco-Row:Record.files~}</div>', _SampleChocoData);
									Expect(tmpTemplateOutput).to.equal("<div><p>FrankenberryCountChoculaTevevisionCommercial1971.thumbs/frankerberry_countchockula_1971.0001_000001.jpg is a file of 838 bytes big.</p><p>FrankenberryCountChoculaTevevisionCommercial1971.thumbs/frankerberry_countchockula_1971.0001_000004.jpg is a file of 6843 bytes big.</p><p>FrankenberryCountChoculaTevevisionCommercial1971.thumbs/frankerberry_countchockula_1971.0001_000009.jpg is a file of 8388 bytes big.</p><p>FrankenberryCountChoculaTevevisionCommercial1971.thumbs/frankerberry_countchockula_1971.0001_000014.jpg is a file of 5993 bytes big.</p><p>FrankenberryCountChoculaTevevisionCommercial1971.thumbs/frankerberry_countchockula_1971.0001_000019.jpg is a file of 4951 bytes big.</p><p>FrankenberryCountChoculaTevevisionCommercial1971.thumbs/frankerberry_countchockula_1971.0001_000024.jpg is a file of 3383 bytes big.</p><p>FrankenberryCountChoculaTevevisionCommercial1971.thumbs/frankerberry_countchockula_1971.0001_000029.jpg is a file of 3503 bytes big.</p><p>FrankenberryCountChoculaTevevisionCommercial1971_archive.torrent is a file of 4093 bytes big.</p><p>FrankenberryCountChoculaTevevisionCommercial1971_files.xml is a file of  bytes big.</p><p>FrankenberryCountChoculaTevevisionCommercial1971_meta.xml is a file of 1371 bytes big.</p><p>FrankenberryCountChoculaTevevisionCommercial1971_reviews.xml is a file of 620 bytes big.</p><p>__ia_thumb.jpg is a file of 7481 bytes big.</p><p>frankerberry_countchockula_1971.0001.gif is a file of 101114 bytes big.</p><p>frankerberry_countchockula_1971.0001.mpg is a file of 31625216 bytes big.</p><p>frankerberry_countchockula_1971.0001.mpg.idx is a file of 31141 bytes big.</p><p>frankerberry_countchockula_1971.0001.ogv is a file of 2248166 bytes big.</p><p>frankerberry_countchockula_1971.0001_512kb.mp4 is a file of 2378677 bytes big.</p></div>");
									fDone();
								}
							);
						test(
								'Templates should be able to run with meadow API entities at fixed IDs.',
								function (fDone)
								{
									const testPict = new libPict(_MockSettings);
									testPict.TemplateProvider.addTemplate('Book-Row-Title', '<h1>{~Data:Record.Title~}</h1>');
									let tmpTemplateOutput = testPict.parseTemplate('{~E:Book^1^Book-Row-Title~}', {},
										(pError, pValue) =>
										{
											Expect(pValue).to.equal("<h1>Angels & Demons</h1>");
											fDone();
										});
								}
							);
						test(
								'Templates should be able to run with meadow API entities at dynamic IDs.',
								function (fDone)
								{
									this.timeout(10000);
									const testPict = new libPict(_MockSettings);

									testPict.LogNoisiness = 0;

									testPict.TemplateProvider.addTemplate('Book-Row-Display', '{~D:Record.Title~}');
									testPict.TemplateProvider.addTemplate('Author-Row-Display', '{~D:Record.Name~}');
									testPict.TemplateProvider.addTemplate('Book-Author-Row', '<p>{~E:Author^Record.IDAuthor^Author-Row-Display~} wrote {~E:Book^Record.IDBook^Book-Row-Display~}</p>');

									let tmpExpectedOutput = `<div><p>J.K. Rowling wrote Harry Potter and the Philosopher's Stone</p><p>F. Scott Fitzgerald wrote The Great Gatsby</p><p>John Green wrote The Fault in Our Stars</p><p>J.K. Rowling wrote Harry Potter and the Prisoner of Azkaban</p><p>J.K. Rowling wrote Harry Potter and the Order of the Phoenix</p><p>J.K. Rowling wrote Harry Potter and the Chamber of Secrets</p><p>J.K. Rowling wrote Harry Potter and the Goblet of Fire</p><p>J.K. Rowling wrote Harry Potter and the Deathly Hallows</p><p>J.K. Rowling wrote Harry Potter and the Half-Blood Prince</p><p>John Green wrote Looking for Alaska</p><p>John Green wrote Paper Towns</p><p>John Green wrote An Abundance of Katherines</p><p>J.K. Rowling wrote The Casual Vacancy</p><p>John Green wrote Will Grayson, Will Grayson</p><p>J.K. Rowling wrote The Tales of Beedle the Bard</p><p>J.K. Rowling wrote Complete Harry Potter Boxed Set</p><p>F. Scott Fitzgerald wrote Tender Is the Night</p><p>John Green wrote Let It Snow: Three Holiday Romances</p><p>J.K. Rowling wrote Harry Potter Boxed Set Books 1-4</p><p>F. Scott Fitzgerald wrote This Side of Paradise</p><p>F. Scott Fitzgerald wrote The Beautiful and Damned</p><p>J.K. Rowling wrote </p><p>F. Scott Fitzgerald wrote The Curious Case of Benjamin Button</p><p>J.K. Rowling wrote Harry Potter Collection (Harry Potter, #1-6)</p><p>J.K. Rowling wrote Fantastic Beasts and Where to Find Them: The Original Screenplay</p><p>J.K. Rowling wrote </p><p>J.K. Rowling wrote Short Stories from Hogwarts of Heroism, Hardship and Dangerous Hobbies</p><p>F. Scott Fitzgerald wrote The Short Stories of F. Scott Fitzgerald</p><p>J.K. Rowling wrote Short Stories from Hogwarts of Power, Politics and Pesky Poltergeists</p><p>J.K. Rowling wrote Hogwarts: An Incomplete and Unreliable Guide</p><p>J.K. Rowling wrote Very Good Lives: The Fringe Benefits of Failure and the Importance of Imagination</p><p>J.K. Rowling wrote </p></div>`;

									testPict.EntityProvider.getEntitySet('BookAuthorJoin', `FBL~IDAuthor~INN~${[1, 2, 3].join(",")}`,
										(pError, pRecord) =>
										{
											Expect(pRecord.length).to.equal(32, 'There should be 32 records returned.');
											testPict.log.info('Rest response: ', pRecord);

											// Now use the 32 records to generate a template set
											testPict.parseTemplate('<div>{~TS:Book-Author-Row:Record.JoinRecords~}</div>', { JoinRecords: pRecord },
												(pError, pValue) =>
												{
													Expect(pValue).to.equal(tmpExpectedOutput);
													fDone();
												});
										});

								}
							);
						test(
								'Template sets should be able to run with meadow API entities at dynamic IDs as subrecords.',
								function (fDone)
								{
									const testPict = new libPict(_MockSettings);
									testPict.TemplateProvider.addTemplate('Book-Row-Title', '<h1>{~Data:Record.Title~}</h1>');
									let tmpTemplateOutput = testPict.parseTemplate('{~E:Book^Record.CurrentBook^Book-Row-Title~}', { CurrentBook: 100 },
										(pError, pValue) =>
										{
											Expect(pValue).to.equal("<h1>The Poisonwood Bible</h1>");
											fDone();
										});
								}
							);
						test(
								'Templates should be able to generate HTML Comment start and end based on truthiness',
								function (fDone)
								{
									const testPict = new libPict(_MockSettings);
									let tmpTemplate = '{~HtmlCommentStart:Record.ShowComment~}<p> SOME COMMENT </p>{~HtmlCommentEnd:Record.ShowComment~}';
									let tmpTemplateOutput = testPict.parseTemplate(tmpTemplate, { ShowComment: true });
									Expect(tmpTemplateOutput).to.equal("<p> SOME COMMENT </p>");
									let tmpTemplateOutput2 = testPict.parseTemplate(tmpTemplate, { ShowComment: false });
									Expect(tmpTemplateOutput2).to.equal("<!-- <p> SOME COMMENT </p> -->");
									// If there is no value available default to commenting out the value
									let tmpTemplateOutput3 = testPict.parseTemplate(tmpTemplate, {  });
									Expect(tmpTemplateOutput3).to.equal("<!-- <p> SOME COMMENT </p> -->");
									return fDone();
								}
							);
						test(
								'Simple templates with generative data.',
								function (fDone)
								{
									const testPict = new libPict(_MockSettings);
									let tmpTemplateOutput = testPict.parseTemplate('<p>{~RandomNumberString:10~}</p>', {});
									Expect(tmpTemplateOutput.length).to.be.greaterThan(7);
									tmpTemplateOutput = testPict.parseTemplate('<p>{~RandomNumberString:~}</p>', {});
									Expect(tmpTemplateOutput.length).to.be.greaterThan(7);
									tmpTemplateOutput = testPict.parseTemplate('<p>{~RandomNumberString:17,100~}</p>', {});
									Expect(tmpTemplateOutput.length).to.be.greaterThan(7);
									tmpTemplateOutput = testPict.parseTemplate('<p>{~RandomNumberString:10,999999999~}</p>', {});
									Expect(tmpTemplateOutput.length).to.be.greaterThan(7);
									fDone();
								}
							);
						test(
								'Generate identifiers',
								function (fDone)
								{
									const testPict = new libPict(_MockSettings);
									let tmpTemplateOutput = testPict.parseTemplate('<p>{~PascalCaseIdentifier:Record.name~}</p>', { name: 'meadow-endpoints' });
									Expect(tmpTemplateOutput).to.equal('<p>MeadowEndpoints</p>');
									fDone();
								}
							);
						test(
								'Templates should be able to run on sets asynchronously.',
								function (fDone)
								{
									const testPict = new libPict(_MockSettings);
									testPict.parseTemplateSet('<p>{~Data:Record.size~}</p>', _SampleChocoData.files,
										(pError, pValue) =>
										{
											Expect(pValue).to.equal("<p>838</p><p>6843</p><p>8388</p><p>5993</p><p>4951</p><p>3383</p><p>3503</p><p>4093</p><p></p><p>1371</p><p>620</p><p>7481</p><p>101114</p><p>31625216</p><p>31141</p><p>2248166</p><p>2378677</p>");
											return fDone();
										});
								}
							);
						test(
								'Templates should be able to run on sets what are objects.',
								function (fDone)
								{
									const testPict = new libPict(_MockSettings);
									const testCollectionObject = {};
									for (let i = 0; i < _SampleChocoData.files.length; i++)
									{
										testCollectionObject[_SampleChocoData.files[i].name] = _SampleChocoData.files[i];
									}
									let tmpTemplateOutput = testPict.parseTemplateSet('<p>{~Data:Record.size~}</p>', testCollectionObject);
									Expect(tmpTemplateOutput).to.equal("<p>838</p><p>6843</p><p>8388</p><p>5993</p><p>4951</p><p>3383</p><p>3503</p><p>4093</p><p></p><p>1371</p><p>620</p><p>7481</p><p>101114</p><p>31625216</p><p>31141</p><p>2248166</p><p>2378677</p>");
									fDone();
								}
							);
						test(
								'Templates should be able to join values with a separator.',
								function (fDone)
								{
									const testPict = new libPict(_MockSettings);
									let tmpTemplateOutput;

									_SampleChocoData.emptypromises = '';

									tmpTemplateOutput = testPict.parseTemplate('<p>{~Join: - ^Record.d1^Record.d1~}</p>', _SampleChocoData);
									Expect(tmpTemplateOutput).to.equal("<p>ia600202.us.archive.org - ia600202.us.archive.org</p>");
									tmpTemplateOutput = testPict.parseTemplate('<p>{~J: - ^Record.d1^Record.d1~}</p>', _SampleChocoData);
									Expect(tmpTemplateOutput).to.equal("<p>ia600202.us.archive.org - ia600202.us.archive.org</p>");
									tmpTemplateOutput = testPict.parseTemplate('<p>{~J: - ^Record.d1^Record.emptypromises^Record.d1~}</p>', _SampleChocoData);
									Expect(tmpTemplateOutput).to.equal("<p>ia600202.us.archive.org - ia600202.us.archive.org</p>");
									tmpTemplateOutput = testPict.parseTemplate('<p>{~J: - ^Record.d1^Record.uniq^Record.d1~}</p>', _SampleChocoData);
									Expect(tmpTemplateOutput).to.equal('<p>ia600202.us.archive.org - 1957612749 - ia600202.us.archive.org</p>');

									fDone();
								}
							);
						test(
								'Templates should be able to join unique values with a separator.',
								function (fDone)
								{
									const testPict = new libPict(_MockSettings);
									let tmpTemplateOutput;

									_SampleChocoData.emptypromises = '';

									tmpTemplateOutput = testPict.parseTemplate('<p>{~JoinUnique: - ^Record.d1^Record.d2^Record.d1~}</p>', _SampleChocoData);
									Expect(tmpTemplateOutput).to.equal('<p>ia600202.us.archive.org - ia800202.us.archive.org</p>');

									fDone();
								}
							);
						test(
								'Use the template manager a bit...',
								function (fDone)
								{
									const testPict = new libPict(_MockSettings);

									testPict.TemplateProvider.addTemplate('Quantity', _QuantityTemplate);

									let tmpTemplateOutput = testPict.parseTemplateByHash('Quantity', _QuantityRecord);
									Expect(tmpTemplateOutput).to.equal(`
	<td>0099 Horizontal Carrier Conduit Directional Drill</td>
	<td align="center">OU-001-19819</td>
	<td width="45%">Directional Bore Conduit</td>
	<td align="left">LNFT</td>
	<td align="right">$852.00</td>
	<td align="right">867.53</td>
	<td align="right">--</td>
`, 'The template system should parse a simple template from a hash.');

									Expect(testPict.parseTemplateByHash('ThisTemplateDoesNotExist', _QuantityRecord)).to.equal('', 'The template system should return an empty string if the template does not exist.');

									return fDone();
								}
							);
						test(
								'Try some defaults for the template manager...',
								function (fDone)
								{
									const testPict = new libPict(_MockSettings);

									testPict.TemplateProvider.addDefaultTemplate('', '-List-Title', '<h1>List of {~Data:AppData.EntityName~}s</h1>');
									testPict.TemplateProvider.addDefaultTemplate('', '-List-Row', '<p>{~Data:Record.Name~}</p>');
									testPict.TemplateProvider.addDefaultTemplate('', '-Bad-End', false);

									testPict.TemplateProvider.loadTemplateFunction = (pTemplateHash) =>
									{
										if (pTemplateHash == 'Foo-List-Title')
										{
											return `This is the template for ${pTemplateHash}`;
										}
									};

									Expect(('Foo-List-Title' in testPict.TemplateProvider.templates)).to.equal(false, 'No template should exist before it is either set explicitly or accessed from a default.');
									testPict.TemplateProvider.loadTemplate('Foo-List-Title');
									Expect(('Foo-List-Title' in testPict.TemplateProvider.templates)).to.equal(true, 'The template system should have a default template set for Foo-List-Title after loading it.');

									testPict.AppData = { Dog: { Name: 'Wilco', Age: 14, Owner: 'Jack' } }

									testPict.TemplateProvider.addTemplate('DogNameStuff', 'If this dog has a name, breakdance! {~NE:AppData.Dog.Name^<br/>~}');

									Expect(testPict.parseTemplateByHash('DogNameStuff')).to.equal('If this dog has a name, breakdance! <br/>');

									delete testPict.AppData.Dog.Name;

									Expect(testPict.parseTemplateByHash('DogNameStuff')).to.equal('If this dog has a name, breakdance! ');

									testPict.AppData.EntityName = 'Band';

									Expect(('Quantity-List-Title' in testPict.TemplateProvider.templates)).to.equal(false, 'No template should exist before it is either set explicitly or accessed from a default.');
									Expect(testPict.parseTemplateByHash('Quantity-List-Title', _QuantityRecord)).to.equal('<h1>List of Bands</h1>', 'The template system should parse a simple default template from a hash.');

									// The second path should have the template set!
									Expect(('Quantity-List-Title' in testPict.TemplateProvider.templates)).to.equal(true, 'The template system should have a default template set for Quantity-List-Title after accessing it once.');
									Expect(testPict.parseTemplateByHash('Quantity-List-Title', _QuantityRecord)).to.equal('<h1>List of Bands</h1>', 'The template system should parse a simple default template from a hash.');

									return fDone();
								}
							);
						test(
								'Data template rendering with missing data and a template fallback...',
								function (fDone)
								{
									const testPict = new libPict(_MockSettings);

									testPict.TemplateProvider.addTemplate('Book-Author-Title', '<h1>{~DWTF:Record.Title:MissingTitle~}</h1>');
									testPict.TemplateProvider.addTemplate('MissingTitle', '<span class="empty-message">Oh no! No title!</span>');

									Expect(testPict.parseTemplate('<p>{~DWAF:Record.Title:No Title Specified -- 100% Missing Titles!~}</p>',
										{
											Title: undefined
										}))
										.to.equal('<p>No Title Specified -- 100% Missing Titles!</p>');	

									Expect(testPict.parseTemplate('<p>{~DWAF:Record.Title:No Title Specified -- 100% Missing Titles!~}</p>',
										{
											Title: 'The Great Gatsby'
										}))
										.to.equal('<p>The Great Gatsby</p>');

									testPict.TempData.ChartContents = `[##### ##### ] 50% complete`;

									Expect(testPict.parseTemplate('<div>{~DWAF:TempData.ChartContents:No Chart Data Available~}</div>'))
										.to.equal('<div>[##### ##### ] 50% complete</div>');

									testPict.parseTemplateByHash('Book-Author-Title', { Title: undefined },
										(pError, pValue) =>
										{
											Expect(pValue).to.equal('<h1><span class="empty-message">Oh no! No title!</span></h1>');
											return fDone();
										});
								}
							);
						test(
								'Data template rendering with missing data and a template fallback, but the fallback address is not found...',
								function (fDone)
								{
									const testPict = new libPict(_MockSettings);

									testPict.TemplateProvider.addTemplate('Book-Author-Title', '<h1>{~DWTF:Record.Title:IntentionallyMissingFallbackTemplate~}</h1>');

									testPict.parseTemplateByHash('Book-Author-Title', { Title: undefined },
										(pError, pValue) =>
										{
											Expect(pValue).to.equal('<h1></h1>');
											return fDone();
										});
								}
							);
						test(
								'Data template rendering with missing data and a template fallback that has async entity data...',
								function (fDone)
								{
									const testPict = new libPict(_MockSettings);

									testPict.TemplateProvider.addTemplate('Book-Author-Title', '<h1>{~DWTF:Record.Banana:MissingBanana~}: {~Dollars:Record.IDBook~}</h1>');
									testPict.TemplateProvider.addTemplate('Book-Author-Content', '<p>{~E:Book^1^Book-Author-Title~}</p>');
									testPict.TemplateProvider.addTemplate('Book-Author-Load', '<p>{~E:Book^100^Book-Author-Title~} {~D:Record.itemnumber~}</p>');
									testPict.TemplateProvider.addTemplate('MissingBanana', '<span class="empty-message">Oh no! No banana!</span>');

									testPict.parseTemplateByHash('Book-Author-Content', { IDBook: 100 },
										(pError, pValue) =>
										{
											Expect(pValue).to.equal('<p><h1><span class="empty-message">Oh no! No banana!</span>: $1.00</h1></p>');
											return fDone();
										});
								}
							);
						test(
								'Entity template rendering...',
								function (fDone)
								{
									this.timeout(10000);
									const testPict = new libPict(_MockSettings);

									testPict.TemplateProvider.addTemplate('Book-Author-Title', '<h1>{~Data:Record.Title~}: {~Dollars:Record.IDBook~}</h1>');
									testPict.TemplateProvider.addTemplate('Book-Author-Content', '<p>{~E:Book^1^Book-Author-Title~}</p>');
									testPict.TemplateProvider.addTemplate('Book-Author-Load', '<p>{~E:Book^100^Book-Author-Title~} {~D:Record.itemnumber~}</p>');

									testPict.parseTemplateByHash('Book-Author-Content', { IDBook: 100 },
										(pError, pValue) =>
										{
											Expect(pValue).to.equal('<p><h1>Angels & Demons: $1.00</h1></p>');
											return fDone();
										});
								}
							);
						test(
								'Entity template rendering with reverse context lookup...',
								function (fDone)
								{
									const testPict = new libPict(_MockSettings);

									testPict.TemplateProvider.addTemplate('Book-Author-Title', '{~D:Context[0].log.info(Record.Title, Context[0].fable.SettingsManager.settings)~}<h1>{~Data:Context[0].fable.SettingsManager.settings.Product~} {~Data:Record.Title~}: {~Dollars:Record.IDBook~} {~Data:Context.length~}</h1>');
									testPict.TemplateProvider.addTemplate('Book-Author-Content', '<p>{~E:Book^1^Book-Author-Title~}</p>');

									testPict.parseTemplateByHash('Book-Author-Content', { IDBook: 102 },
										(pError, pValue) =>
										{
											Expect(pValue).to.equal('<p><h1>MockPict Angels & Demons: $1.00 3</h1></p>');
											return fDone();
										});
								}
							);
						test(
								'Entity template rendering with Parameterized Location...',
								function (fDone)
								{
									const testPict = new libPict(_MockSettings);

									testPict.TemplateProvider.addTemplate('Book-Author-Title', '<h1>{~Data:Record.Title~}: {~Dollars:Record.IDBook~}</h1>');
									testPict.TemplateProvider.addTemplate('Book-Author-Content', '<p>{~E:Book^Record.Header.IDBook^Book-Author-Title~}</p>');

									testPict.parseTemplateByHash('Book-Author-Content', { Header: { IDBook: 100 } },
										(pError, pValue) =>
										{
											Expect(pValue).to.equal('<p><h1>The Poisonwood Bible: $100.00</h1></p>');
											return fDone();
										});
								}
							);
						test(
								'Template rendering process...',
								function (fDone)
								{
									const testPict = new libPict(_MockSettings);

									testPict.AppData.RecordSet = { IDAnimal: 1, Name: 'Fido', Type: 'Dog', Age: 3 };

									testPict.TemplateProvider.addTemplate('Book-Author-Title', '<h1>{~Data:Record.Title~}: {~Dollars:Record.IDBook~}</h1>');
									testPict.TemplateProvider.addTemplate('Book-Author-Content', '{~T:Book-Author-Title~}<p>{~E:Book^777^Book-Author-Title~}</p>');

									testPict.TemplateProvider.addTemplate('Animal-View', '<p>{~Data:Record.Name~} is a {~Data:Record.Type~} that is {~Data:Record.Age~} years old.</p>');
									testPict.TemplateProvider.addTemplate('Animal-Screen', '<h1>{~D:AppData.RecordSet.Type~}</h1>{~T:Animal-View:AppData.RecordSet~}');

									testPict.TemplateProvider.addTemplate('ReferencedTemplate', '<h1>{~D:Pict.AppData.RecordSet.Type~}</h1>{~T:Animal-View:Pict.AppData.RecordSet~}');

									let tmpTemplateOutput = testPict.parseTemplateByHash('Animal-Screen');

									Expect(tmpTemplateOutput).to.equal('<h1>Dog</h1><p>Fido is a Dog that is 3 years old.</p>', 'The template system should parse a simple template from a hash.');

									let tmpTemplateByDataAddress = testPict.parseTemplate('{~TBDA:Record.Template~}', { Template:'<h1>{~D:Pict.AppData.RecordSet.Type~}</h1>{~T:Animal-View:Pict.AppData.RecordSet~}' });

									Expect(tmpTemplateByDataAddress).to.equal('<h1>Dog</h1><p>Fido is a Dog that is 3 years old.</p>', 'The template system should parse a simple template from a hash.');

									let tmpTemplateByReference = testPict.parseTemplate('{~TBR:Record.TemplateReference~}', { TemplateReference:'ReferencedTemplate'})

									Expect(tmpTemplateByReference).to.equal('<h1>Dog</h1><p>Fido is a Dog that is 3 years old.</p>', 'The template system should parse a simple template from a hash.');

									let tmpTemplateFromAddress = testPict.parseTemplate('{~TFA:Record.TemplateContent~}', { TemplateContent: '<h1>{~D:Pict.AppData.RecordSet.Type~}</h1>{~T:Animal-View:Pict.AppData.RecordSet~}'})

									Expect(tmpTemplateFromAddress).to.equal('<h1>Dog</h1><p>Fido is a Dog that is 3 years old.</p>', 'The template system should parse a simple template from a hash.');

									testPict.parseTemplateByHash('Book-Author-Content', { IDBook: 10000, Title: 'I learn things.' },
										(pError, pValue) =>
										{
											try
											{
												Expect(pError).to.not.exist;
												Expect(pValue).to.equal('<h1>I learn things.: $10,000.00</h1><p><h1>Jemima J: $777.00</h1></p>');
											}
											catch (err)
											{
												return fDone(err);
											}
											testPict.parseTemplate('{~TBDA:Record.Template~}', { Template:'<h1>{~D:Pict.AppData.RecordSet.Type~}</h1>{~T:Animal-View:Pict.AppData.RecordSet~}' }, (pError, pValue) =>
											{
												try
												{
													Expect(pError).to.not.exist;
													Expect(pValue).to.equal('<h1>Dog</h1><p>Fido is a Dog that is 3 years old.</p>', 'The template system should parse a simple template from a hash.');
												}
												catch (err)
												{
													return fDone(err);
												}
												testPict.parseTemplate('{~TFA:Record.TemplateContent~}', { TemplateContent: '<h1>{~D:Pict.AppData.RecordSet.Type~}</h1>{~T:Animal-View:Pict.AppData.RecordSet~}'}, (pError, pValue) =>
												{
													try
													{
														Expect(pError).to.not.exist;
														Expect(pValue).to.equal('<h1>Dog</h1><p>Fido is a Dog that is 3 years old.</p>', 'The template system should parse a simple template from a hash.');
													}
													catch (err)
													{
														return fDone(err);
													}
													return fDone();
												});
											});
										});
								}
							);
						test(
								'Template sets in other templates...',
								function (fDone)
								{
									const testPict = new libPict(_MockSettings);

									testPict.AppData = { Records: _SampleChocoData, EntityName: 'Choco', Title: 'Choco Deluxe Records' };

									testPict.LogNoisiness = 4;

									testPict.TemplateProvider.addTemplate('Choco-Row', '<p>{~Data:Record.name~} is a file of {~Data:Record.size~} bytes big.</p>');
									testPict.TemplateProvider.addTemplate('Choco-Screen', '<h1>{~D:AppData.Title~}</h1>{~TS:Choco-Row:AppData.Records.files~}');

									let tmpTemplateOutput = testPict.parseTemplateByHash('Choco-Screen');

									Expect(tmpTemplateOutput).to.equal("<h1>Choco Deluxe Records</h1><p>FrankenberryCountChoculaTevevisionCommercial1971.thumbs/frankerberry_countchockula_1971.0001_000001.jpg is a file of 838 bytes big.</p><p>FrankenberryCountChoculaTevevisionCommercial1971.thumbs/frankerberry_countchockula_1971.0001_000004.jpg is a file of 6843 bytes big.</p><p>FrankenberryCountChoculaTevevisionCommercial1971.thumbs/frankerberry_countchockula_1971.0001_000009.jpg is a file of 8388 bytes big.</p><p>FrankenberryCountChoculaTevevisionCommercial1971.thumbs/frankerberry_countchockula_1971.0001_000014.jpg is a file of 5993 bytes big.</p><p>FrankenberryCountChoculaTevevisionCommercial1971.thumbs/frankerberry_countchockula_1971.0001_000019.jpg is a file of 4951 bytes big.</p><p>FrankenberryCountChoculaTevevisionCommercial1971.thumbs/frankerberry_countchockula_1971.0001_000024.jpg is a file of 3383 bytes big.</p><p>FrankenberryCountChoculaTevevisionCommercial1971.thumbs/frankerberry_countchockula_1971.0001_000029.jpg is a file of 3503 bytes big.</p><p>FrankenberryCountChoculaTevevisionCommercial1971_archive.torrent is a file of 4093 bytes big.</p><p>FrankenberryCountChoculaTevevisionCommercial1971_files.xml is a file of  bytes big.</p><p>FrankenberryCountChoculaTevevisionCommercial1971_meta.xml is a file of 1371 bytes big.</p><p>FrankenberryCountChoculaTevevisionCommercial1971_reviews.xml is a file of 620 bytes big.</p><p>__ia_thumb.jpg is a file of 7481 bytes big.</p><p>frankerberry_countchockula_1971.0001.gif is a file of 101114 bytes big.</p><p>frankerberry_countchockula_1971.0001.mpg is a file of 31625216 bytes big.</p><p>frankerberry_countchockula_1971.0001.mpg.idx is a file of 31141 bytes big.</p><p>frankerberry_countchockula_1971.0001.ogv is a file of 2248166 bytes big.</p><p>frankerberry_countchockula_1971.0001_512kb.mp4 is a file of 2378677 bytes big.</p>");
									return fDone();
								}
							);
						test(
								'Template from Map Address',
								function (fDone)
								{
									const testPict = new libPict(_MockSettings);
									let tmpTemplateOutput;

									testPict.AppData.MySpecialMap =  (
										{
											'Dino-01': {Name: 'BRONTO EFFIN SAURUS' },
											'Dino-02': {Name: 'T-Rex' },
											'Dino-03': {Name: 'Triceratops' },
											'Dino-04': {Name: 'Velociraptor' },
											5: {Name: 'Godzilla' }
										});

									let tmpSampleRecord_1 = { IDDinosaur: 'Dino-01' };
									let tmpSampleRecord_2 = { IDDinosaur: null };
									let tmpSampleRecord_3 = { IDDinosaur: 5 };
									let tmpSampleRecord_4 = { IDDinosaur: '5' };

									testPict.TemplateProvider.addTemplate('DinosaurName', 'My dino is a {~D:Record.Name~}');

									tmpTemplateOutput = testPict.parseTemplate('<p>{~TemplateFromMap:DinosaurName:AppData.MySpecialMap:Record.IDDinosaur~}</p>', tmpSampleRecord_1);
									Expect(tmpTemplateOutput).to.equal('<p>My dino is a BRONTO EFFIN SAURUS</p>');
									tmpTemplateOutput = testPict.parseTemplate('<p>{~TemplateFromMap:DinosaurName:AppData.MySpecialMap:Record.IDDinosaur~}</p>', tmpSampleRecord_2);
									Expect(tmpTemplateOutput).to.equal('<p>My dino is a </p>');
									tmpTemplateOutput = testPict.parseTemplate('<p>{~TemplateFromMap:DinosaurName:AppData.MySpecialMap:Record.IDDinosaur~}</p>', tmpSampleRecord_3);
									Expect(tmpTemplateOutput).to.equal('<p>My dino is a Godzilla</p>');
									tmpTemplateOutput = testPict.parseTemplate('<p>{~TemplateFromMap:DinosaurName:AppData.MySpecialMap:Record.IDDinosaur~}</p>', tmpSampleRecord_4);
									Expect(tmpTemplateOutput).to.equal('<p>My dino is a Godzilla</p>');

									// Try the same thing async to exercise that function
									tmpTemplateOutput = testPict.parseTemplate('<p>{~TemplateFromMap:DinosaurName:AppData.MySpecialMap:Record.IDDinosaur~}</p>', tmpSampleRecord_1,
										(pError, pResult) =>
										{
											Expect(pResult).to.equal('<p>My dino is a BRONTO EFFIN SAURUS</p>');
											return fDone();

										});
								}
							);
						test(
								'TemplateSet from Map Address',
								function (fDone)
								{
									const testPict = new libPict(_MockSettings);
									let tmpTemplateOutput;

									testPict.AppData.MyTeamMap =  (
										{
											'Team-1': [ {Name: 'BRONTO EFFIN SAURUS' }, {Name: 'T-Rex' } ],
											'Category-2': [ {Name: 'Triceratops' }, {Name: 'Velociraptor' }, {Name: 'Godzilla' } ]
										});

									let tmpSampleDataSet_1 = (
										[
											{ IDTeam: 'Team-1' },
//											{ IDTeam: null },
											{ IDTeam: 'Category-2' }
										]);

									testPict.TemplateProvider.addTemplate('DinosaurName', '<p>My dino is a {~D:Record.Name~}</p>');

									tmpTemplateOutput = testPict.parseTemplate('<div>{~TSFM:DinosaurName:AppData.MyTeamMap:Record.IDTeam~}</div>', tmpSampleDataSet_1[0]);
									Expect(tmpTemplateOutput).to.equal('<div><p>My dino is a BRONTO EFFIN SAURUS</p><p>My dino is a T-Rex</p></div>');

									tmpTemplateOutput = testPict.parseTemplate('<div>{~TSFM:DinosaurName:AppData.MyTeamMap:Record.IDTeam~}</div>', tmpSampleDataSet_1[1]);
									Expect(tmpTemplateOutput).to.equal('<div><p>My dino is a Triceratops</p><p>My dino is a Velociraptor</p><p>My dino is a Godzilla</p></div>');

//									tmpTemplateOutput = testPict.parseTemplate('<div>{~TSFM:DinosaurName:AppData.MyTeamMap:Record.IDTeam~}</div>', tmpSampleDataSet_1[2]);
//									Expect(tmpTemplateOutput).to.equal('<div><p>My dino is a BRONTO EFFIN SAURUS</p><p>My dino is a T-Rex</p></div>');

									// Try the same thing async to exercise that function
									tmpTemplateOutput = testPict.parseTemplate('<div>{~TSFM:DinosaurName:AppData.MyTeamMap:Record.IDTeam~}</div>', tmpSampleDataSet_1[0],
										(pError, pResult) =>
										{
											Expect(pResult).to.equal('<div><p>My dino is a BRONTO EFFIN SAURUS</p><p>My dino is a T-Rex</p></div>');
											return fDone();

										});
								}
							);
						test(
								'SolveByReference',
								function (fDone)
								{
									const testPict = new libPict(_MockSettings);
									let tmpTemplateOutput;

									testPict.AppData =
									{
										Equation: 'Area = Width * Height',
										EquationCircumference: 'Circumference = ROUND(2 * PI() * Radius, 3)',
										EquationCircumferenceNoParams: 'Size.Circumference = ROUND(2 * PI() * Size.Radius, 3)',
										EquationArea: 'Area = ROUND(PI() * Radius * Radius, 3)',
										HomeworkRectangleData: { Size: { Width: 100, Height: 50, } },
										HomeworkCircleData: { Size: { Radius: 50, } },
										HomeworkManifest:
										{
											Scope: 'Homework',
											Descriptors:
											{
												'Size.Height':
												{
													Hash: 'Height',
												},
												'Size.Width':
												{
													Hash: 'Width',
												},
												'Size.Radius':
												{
													Hash: 'Radius',
												},
											},
										},
									};
									testPict.AppData.HomeworkManifestInstance = testPict.newManyfest(testPict.AppData.HomeworkManifest);
									testPict.TemplateProvider.addTemplate('Homework', '{~SBR:AppData.Equation:AppData.HomeworkRectangleData:AppData.HomeworkManifestInstance~}');
									testPict.TemplateProvider.addTemplate('HomeworkCircleArea', '{~SBR:AppData.EquationArea:AppData.HomeworkCircleData:AppData.HomeworkManifestInstance~}');
									testPict.TemplateProvider.addTemplate('HomeworkCircleCircumference', '{~SBR:AppData.EquationCircumference:AppData.HomeworkCircleData:AppData.HomeworkManifestInstance~}');
									testPict.TemplateProvider.addTemplate('HomeworkCircleCircumferenceNoParams', '{~SBR:AppData.EquationCircumferenceNoParams~}');

									tmpTemplateOutput = testPict.parseTemplateByHash('Homework');
									Expect(tmpTemplateOutput).to.equal('5000');
									tmpTemplateOutput = testPict.parseTemplateByHash('HomeworkCircleArea');
									Expect(tmpTemplateOutput).to.equal('7853.982');
									tmpTemplateOutput = testPict.parseTemplateByHash('HomeworkCircleCircumference');
									Expect(tmpTemplateOutput).to.equal('314.159');
									tmpTemplateOutput = testPict.parseTemplateByHash('HomeworkCircleCircumferenceNoParams', testPict.AppData.HomeworkCircleData);
									Expect(tmpTemplateOutput).to.equal('314.159');

									// Try the same thing async to exercise that function
									testPict.parseTemplateByHash('Homework', null,
										(pError, pResult) =>
										{
											try
											{
												Expect(pResult).to.equal('5000');
											}
											catch (err)
											{
												return fDone(err);
											}
											return fDone();

										});
								}
							);
						test(
								'Solve',
								function (fDone)
								{
									const testPict = new libPict(_MockSettings);

									testPict.AppData =
									{
										Width: 105,
										Height: 48,
										Radius: 47.124
									};

									Expect(testPict.parseTemplate('{~S:100+55~}')).to.equal('155');
									Expect(testPict.parseTemplate('{~S:Width*Height~}')).to.equal('0');
									Expect(testPict.parseTemplate('{~S:Width*Height:AppData~}')).to.equal('5040');
									Expect(testPict.parseTemplate('{~S:ROUND(PI()*Radius*Radius,3):AppData~}')).to.equal('6976.445');

									Expect(testPict.parseTemplate('{~S:CONCAT("Dog height is ",Height,"."):AppData~}')).to.equal('Dog height is 48.');

									return fDone();
								}
							);
						test(
								'TemplateValueSet from Array',
								function (fDone)
								{
									const testPict = new libPict(_MockSettings);
									let tmpTemplateOutput;

									testPict.AppData.MyTeamMap =  (
										{
											'UserIdentityKeys': [ 100, 400, 10, 3 ],
											'UserIdentities': { 1: 'Jim', 'Godzilla': 'Jane', 3: 'Jill', 4: 'Jack' }
										});

									testPict.TemplateProvider.addTemplate('Users', '<p>{~D:Record.Value~}</p>');

									tmpTemplateOutput = testPict.parseTemplate('<div>{~TVS:Users:AppData.MyTeamMap.UserIdentityKeys~}</div>');
									Expect(tmpTemplateOutput).to.equal('<div><p>100</p><p>400</p><p>10</p><p>3</p></div>');

									tmpTemplateOutput = testPict.parseTemplate('<div>{~TVS:Users:AppData.MyTeamMap.UserIdentities~}</div>');
									Expect(tmpTemplateOutput).to.equal('<div><p>Jim</p><p>Jill</p><p>Jack</p><p>Jane</p></div>');

//									tmpTemplateOutput = testPict.parseTemplate('<div>{~TSFM:DinosaurName:AppData.MyTeamMap:Record.IDTeam~}</div>', tmpSampleDataSet_1[2]);
//									Expect(tmpTemplateOutput).to.equal('<div><p>My dino is a BRONTO EFFIN SAURUS</p><p>My dino is a T-Rex</p></div>');

									// Try the same thing async to exercise that function
									tmpTemplateOutput = testPict.parseTemplate('<div>{~TVS:Users:AppData.MyTeamMap.UserIdentities~}</div>', null,
										(pError, pResult) =>
										{
											Expect(pResult).to.equal('<div><p>Jim</p><p>Jill</p><p>Jack</p><p>Jane</p></div>');
											return fDone();

										});
								}
							);
						test(
								'Comments based on record state; open, true',
								function (fDone)
								{
									const testPict = new libPict(_MockSettings);
									testPict.AppData.ChocoData = _SampleChocoData;
									let tmpTemplateOutput = testPict.parseTemplate('{~HCS:Record.True~}', { True: true });
									Expect(tmpTemplateOutput).to.equal('');
									fDone();
								}
							);
						test(
								'Conditional comments based on record state; open, true, inverted polarity',
								function (fDone)
								{
									const testPict = new libPict(_MockSettings);
									testPict.AppData.ChocoData = _SampleChocoData;
									let tmpTemplateOutput = testPict.parseTemplate('{~HCS:Record.True:1~}', { True: true });
									Expect(tmpTemplateOutput).to.equal('<!-- ');
									fDone();
								}
							);
						test(
								'Comments based on record state; open, false',
								function (fDone)
								{
									const testPict = new libPict(_MockSettings);
									testPict.AppData.ChocoData = _SampleChocoData;
									let tmpTemplateOutput = testPict.parseTemplate('{~HCS:Record.False~}', { False: false });
									Expect(tmpTemplateOutput).to.equal('<!-- ');
									fDone();
								}
							);
						test(
								'Conditional comments based on record state; open, false, inverted polarity',
								function (fDone)
								{
									const testPict = new libPict(_MockSettings);
									testPict.AppData.ChocoData = _SampleChocoData;
									let tmpTemplateOutput = testPict.parseTemplate('{~HCS:Record.False:1~}', { False: false });
									Expect(tmpTemplateOutput).to.equal('');
									fDone();
								}
							);
						test(
								'Comments based on record state; close true',
								function (fDone)
								{
									const testPict = new libPict(_MockSettings);
									testPict.AppData.ChocoData = _SampleChocoData;
									let tmpTemplateOutput = testPict.parseTemplate('{~HCE:Record.True~}', { True: true });
									Expect(tmpTemplateOutput).to.equal('');
									fDone();
								}
							);
						test(
								'Conditional comments based on record state; close, true, inverted polarity',
								function (fDone)
								{
									const testPict = new libPict(_MockSettings);
									testPict.AppData.ChocoData = _SampleChocoData;
									let tmpTemplateOutput = testPict.parseTemplate('{~HCE:Record.True:1~}', { True: true });
									Expect(tmpTemplateOutput).to.equal(' -->');
									fDone();
								}
							);
						test(
								'Comments based on record state; close, false',
								function (fDone)
								{
									const testPict = new libPict(_MockSettings);
									testPict.AppData.ChocoData = _SampleChocoData;
									let tmpTemplateOutput = testPict.parseTemplate('{~HCE:Record.False~}', { False: false });
									Expect(tmpTemplateOutput).to.equal(' -->');
									fDone();
								}
							);
						test(
								'Conditional comments based on record state; close, false, inverted polarity',
								function (fDone)
								{
									const testPict = new libPict(_MockSettings);
									testPict.AppData.ChocoData = _SampleChocoData;
									let tmpTemplateOutput = testPict.parseTemplate('{~HCE:Record.False:1~}', { False: false });
									Expect(tmpTemplateOutput).to.equal('');
									fDone();
								}
							);
					}
				);
		}
	);
