/**
* QA-environment integration tests for the server-side FilterManager path.
*
* Reproduces the request shape materialsservice executes for
* POST /1.0/LIMS/SamplesFiltered and /SamplesFiltered/Count: a fresh Pict per
* request with a replaced EntityProvider.restClient, driven through
* FilterManager.loadRecordPageByFilter / countRecordsByFilter with clause
* objects as sent by pict-section-recordset (the LIMS web app).
*
* These tests hit a live Headlight QA API and are skipped unless
* PICT_QA_INTEGRATION=1. Credentials come from ~/.headlight.config.json
* ({ ServerURL, UserID, Password }) or a file named by PICT_QA_CONFIG.
*
* The tests are instrumentation-first: they measure event-loop stalls,
* per-request transport/parse cost, and capture EntityProvider log warnings so
* the "would this logging have identified the incident" question is answerable
* from the output.
*/

const Chai = require('chai');
const Expect = Chai.expect;

const libFS = require('fs');
const libOS = require('os');
const libPath = require('path');

const libPict = require('../source/Pict.js');

const RUN_QA_INTEGRATION = (process.env.PICT_QA_INTEGRATION === '1') || (process.env.PICT_QA_INTEGRATION === 'true');

const DOWNLOAD_BATCH_SIZE = 30000; // mirrors materialsservice MaxSupportedBatchSize default
const CONCURRENT_COUNTS = 5; // the 2026-07-16 incident fired 5 Counts within 1.2s

/**
 * Load the QA endpoint configuration.
 *
 * @return {{ ServerURL: string, UserID: string, Password: string }} Parsed configuration.
 */
function loadQAConfiguration()
{
	const tmpConfigPath = process.env.PICT_QA_CONFIG || libPath.join(libOS.homedir(), '.headlight.config.json');
	if (!libFS.existsSync(tmpConfigPath))
	{
		throw new Error(`QA integration config not found at [${tmpConfigPath}] — create it with { ServerURL, UserID, Password } or set PICT_QA_CONFIG.`);
	}
	return JSON.parse(libFS.readFileSync(tmpConfigPath, 'utf8'));
}

/**
 * Minimal cookie-carrying REST client matching the EntityProvider restClient
 * contract: getJSON/postJSON with (pError, pResponse, pBody) callbacks and
 * pResponse.statusCode. Instruments every request with transport and
 * JSON.parse timings.
 */
class QARestClient
{
	/**
	 * @param {string} pServerURL - Fully qualified URL prefix, e.g. https://api.qa.headlight.com/1.0/
	 */
	constructor(pServerURL)
	{
		this.serverURL = pServerURL;
		this.cookieHeader = '';
		this.session = null;
		/** @type {Array<{Method: string, URL: string, URLLength: number, Status: number, Bytes: number, FetchMS: number, ParseMS: number, Records: number|null}>} */
		this.RequestLog = [];
	}

	/**
	 * Authenticate against the Headlight API and retain the session cookie.
	 *
	 * @param {string} pUserName - Headlight login.
	 * @param {string} pPassword - Headlight password.
	 * @return {Promise<Record<string, any>>} The session record.
	 */
	async authenticate(pUserName, pPassword)
	{
		const tmpResponse = await fetch(`${this.serverURL}Authenticate`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ UserName: pUserName, Password: pPassword }),
			});
		const tmpSetCookies = tmpResponse.headers.getSetCookie ? tmpResponse.headers.getSetCookie() : [];
		this.cookieHeader = tmpSetCookies.map((c) => c.split(';')[0]).join('; ');
		this.session = await tmpResponse.json();
		if (!this.session || !this.session.LoggedIn)
		{
			throw new Error(`QA authentication failed for [${pUserName}] against [${this.serverURL}] — check the Password in ~/.headlight.config.json (see its _comment). Response: ${JSON.stringify(this.session)}`);
		}
		return this.session;
	}

	/**
	 * Perform an instrumented request.
	 *
	 * @param {string} pMethod - HTTP method.
	 * @param {string} pURL - Absolute or prefix-relative URL.
	 * @param {any} pBody - Optional JSON body.
	 * @param {(pError?: Error, pResponse?: {statusCode: number}, pBody?: any) => void} fCallback - Completion callback.
	 */
	request(pMethod, pURL, pBody, fCallback)
	{
		const tmpURL = pURL.startsWith('http') ? pURL : `${this.serverURL}${pURL}`;
		const tmpEntry = { Method: pMethod, URL: tmpURL.length > 180 ? `${tmpURL.substring(0, 180)}…` : tmpURL, URLLength: tmpURL.length, Status: 0, Bytes: 0, FetchMS: 0, ParseMS: 0, Records: null };
		this.RequestLog.push(tmpEntry);
		const tmpFetchStart = Date.now();
		fetch(tmpURL,
			{
				method: pMethod,
				headers: Object.assign({ 'Cookie': this.cookieHeader }, pBody ? { 'Content-Type': 'application/json' } : {}),
				body: pBody ? JSON.stringify(pBody) : undefined,
			})
			.then(async (pResponse) =>
			{
				const tmpText = await pResponse.text();
				tmpEntry.Status = pResponse.status;
				tmpEntry.Bytes = tmpText.length;
				tmpEntry.FetchMS = Date.now() - tmpFetchStart;
				const tmpParseStart = Date.now();
				let tmpParsed = null;
				try
				{
					tmpParsed = JSON.parse(tmpText);
				}
				catch (pParseError)
				{
					tmpParsed = tmpText;
				}
				tmpEntry.ParseMS = Date.now() - tmpParseStart;
				tmpEntry.Records = Array.isArray(tmpParsed) ? tmpParsed.length : null;
				return fCallback(null, { statusCode: pResponse.status }, tmpParsed);
			})
			.catch((pError) =>
			{
				tmpEntry.FetchMS = Date.now() - tmpFetchStart;
				return fCallback(pError);
			});
	}

	/**
	 * @param {string|{url: string}} pOptionsOrURL - URL string or options object.
	 * @param {Function} fCallback - (pError, pResponse, pBody)
	 */
	getJSON(pOptionsOrURL, fCallback)
	{
		const tmpURL = (typeof pOptionsOrURL === 'string') ? pOptionsOrURL : pOptionsOrURL.url;
		return this.request('GET', tmpURL, null, fCallback);
	}

	/**
	 * @param {{url: string, body?: any}} pOptions - Request options.
	 * @param {Function} fCallback - (pError, pResponse, pBody)
	 */
	postJSON(pOptions, fCallback)
	{
		return this.request('POST', pOptions.url, pOptions.body, fCallback);
	}
}

/**
 * Samples the event loop on a 25ms interval and records stalls, the direct
 * analog of the healthcheck-visible blockage in the 2026-07-16 incident
 * (Cattle: 1s probe timeout, 4 consecutive failures at 2s interval = kill).
 */
class EventLoopMonitor
{
	constructor()
	{
		this.interval = null;
		this.expected = 0;
		this.MaxLagMS = 0;
		this.TotalStallMS = 0;
		/** @type {Array<{AtMS: number, LagMS: number}>} */
		this.Stalls = [];
		this.startTime = 0;
	}

	start()
	{
		this.startTime = Date.now();
		this.expected = this.startTime + 25;
		this.interval = setInterval(() =>
		{
			const tmpNow = Date.now();
			const tmpLag = tmpNow - this.expected;
			this.expected = tmpNow + 25;
			if (tmpLag > this.MaxLagMS)
			{
				this.MaxLagMS = tmpLag;
			}
			if (tmpLag > 50)
			{
				this.TotalStallMS += tmpLag;
				this.Stalls.push({ AtMS: tmpNow - this.startTime, LagMS: tmpLag });
			}
		}, 25);
	}

	/**
	 * @return {{MaxLagMS: number, TotalStallMS: number, StallCount: number, Stalls: Array<{AtMS: number, LagMS: number}>}} Stall statistics.
	 */
	stop()
	{
		clearInterval(this.interval);
		return { MaxLagMS: this.MaxLagMS, TotalStallMS: this.TotalStallMS, StallCount: this.Stalls.length, Stalls: this.Stalls };
	}
}

/**
 * Build a Pict wired the way MaterialSampleController builds one per request.
 *
 * @param {QARestClient} pRestClient - The authenticated QA client.
 * @param {string} pServerURL - URL prefix for entity reads.
 * @return {import('../source/Pict.js')} The configured Pict with warning capture at .CapturedWarnings.
 */
function createServerSidePict(pRestClient, pServerURL)
{
	const tmpPict = new libPict(
		{
			Product: 'PictQAFilterIntegration',
			PictDefaultDownloadBatchSize: DOWNLOAD_BATCH_SIZE,
			PictDefaultURLPrefix: pServerURL,
		});
	tmpPict.EntityProvider.restClient = pRestClient;
	const tmpCapturedWarnings = [];
	const tmpOriginalWarn = tmpPict.log.warn.bind(tmpPict.log);
	tmpPict.log.warn = (...pArgs) =>
	{
		tmpCapturedWarnings.push(String(pArgs[0]));
		return tmpOriginalWarn(...pArgs);
	};
	tmpPict.CapturedWarnings = tmpCapturedWarnings;
	return tmpPict;
}

/**
 * The DestinationLab clause exactly as the LIMS app ships it
 * (web/lims/config/LADOTD/sample-filter-manifest.json), decorated the way
 * pict-section-recordset does at runtime.
 *
 * @param {Array<number>} pLabIDs - Selected IDLab values.
 * @return {Record<string, any>} The clause object.
 */
function buildDestinationLabClause(pLabIDs)
{
	return {
		Label: 'Destination Lab',
		DisplayName: 'Selected Records',
		ClauseKey: 'DestinationLab_Selected',
		FilterKey: 'DestinationLab',
		Type: 'ExternalJoinSelectedValueList',
		ExternalFilterByColumns: [ 'Name', 'IDLab' ],
		MaximumSelectedExternalRecords: 5,
		ExternalRecordDisplayTemplate: '{~D:Record.Data.Name~}',
		CoreConnectionColumn: 'IDSample',
		JoinTable: 'SampleLabJoin',
		JoinTableExternalConnectionColumn: 'IDLab',
		JoinTableCoreConnectionColumn: 'IDSample',
		ExternalFilterByTable: 'Lab',
		ExternalFilterByTableConnectionColumn: 'IDLab',
		Ordinal: 1,
		Hash: `DestinationLab-DestinationLab_Selected-test`,
		RecordSet: 'Sample',
		Values: pLabIDs,
	};
}

/**
 * Mirror of MaterialSampleController.countFilteredSamples.
 *
 * @param {import('../source/Pict.js')} pPict - A server-side Pict.
 * @param {Array<Record<string, any>>} pClauses - Filter clauses.
 * @return {Promise<{Count: any, ElapsedMS: number}>} The count and wall time.
 */
function runCount(pPict, pClauses)
{
	return new Promise((resolve, reject) =>
	{
		const tmpStart = Date.now();
		const tmpExperience = { Entity: 'Sample', ResultDestinationAddress: 'AppData.CountResults' };
		pPict.providers.FilterManager.countRecordsByFilter(pClauses, tmpExperience, (pError) =>
		{
			if (pError)
			{
				return reject(pError);
			}
			return resolve({ Count: pPict.resolveStateFromAddress('AppData.CountResults'), ElapsedMS: Date.now() - tmpStart });
		});
	});
}

/**
 * Mirror of MaterialSampleController.filterSamples.
 *
 * @param {import('../source/Pict.js')} pPict - A server-side Pict.
 * @param {Array<Record<string, any>>} pClauses - Filter clauses.
 * @param {number} pBegin - Page offset.
 * @param {number} pCap - Page size.
 * @return {Promise<{Records: any, ElapsedMS: number}>} The page and wall time.
 */
function runPage(pPict, pClauses, pBegin, pCap)
{
	return new Promise((resolve, reject) =>
	{
		const tmpStart = Date.now();
		const tmpExperience = { Entity: 'Sample', ResultDestinationAddress: 'AppData.FilterResults' };
		pPict.providers.FilterManager.loadRecordPageByFilter(pClauses, tmpExperience, pBegin, pCap, (pError) =>
		{
			if (pError)
			{
				return reject(pError);
			}
			return resolve({ Records: pPict.resolveStateFromAddress('AppData.FilterResults'), ElapsedMS: Date.now() - tmpStart });
		});
	});
}

/**
 * Print an instrumentation report for one scenario.
 *
 * @param {string} pLabel - Scenario name.
 * @param {QARestClient} pClient - Client whose RequestLog to report (sliced from pLogMark).
 * @param {number} pLogMark - RequestLog index at scenario start.
 * @param {ReturnType<EventLoopMonitor['stop']>} pLoopStats - Loop stall stats.
 * @param {Array<string>} pWarnings - Captured EntityProvider warnings.
 */
function reportScenario(pLabel, pClient, pLogMark, pLoopStats, pWarnings)
{
	const tmpRequests = pClient.RequestLog.slice(pLogMark);
	const tmpTotalBytes = tmpRequests.reduce((s, r) => s + r.Bytes, 0);
	const tmpTotalParse = tmpRequests.reduce((s, r) => s + r.ParseMS, 0);
	console.log(`\n===== [${pLabel}] =====`);
	console.log(`  Requests: ${tmpRequests.length}  TotalBytes: ${tmpTotalBytes}  TotalParseMS: ${tmpTotalParse}`);
	for (const tmpRequest of tmpRequests)
	{
		console.log(`   - ${tmpRequest.Method} ${tmpRequest.URL} [urlLen ${tmpRequest.URLLength}] -> ${tmpRequest.Status} ${tmpRequest.Bytes}b fetch ${tmpRequest.FetchMS}ms parse ${tmpRequest.ParseMS}ms${tmpRequest.Records === null ? '' : ` records ${tmpRequest.Records}`}`);
	}
	console.log(`  EventLoop: maxLag ${pLoopStats.MaxLagMS}ms, stalls>50ms ${pLoopStats.StallCount}, totalStall ${pLoopStats.TotalStallMS}ms`);
	if (pLoopStats.Stalls.length)
	{
		console.log(`   stalls: ${pLoopStats.Stalls.map((s) => `${s.LagMS}ms@${s.AtMS}ms`).join(', ')}`);
	}
	console.log(`  EntityProvider warnings (${pWarnings.length}):`);
	for (const tmpWarning of pWarnings)
	{
		console.log(`   ! ${tmpWarning}`);
	}
}

(RUN_QA_INTEGRATION ? suite : suite.skip)(
	'Pict FilterManager QA Integration (materialsservice SamplesFiltered repro)',
	function()
	{
		this.timeout(900000);

		let _Config;
		let _Client;
		let _ServerURL;
		let _CandidateLabs = [];

		suiteSetup(
			async function()
			{
				_Config = loadQAConfiguration();
				_ServerURL = _Config.ServerURL;
				_Client = new QARestClient(_ServerURL);
				const tmpSession = await _Client.authenticate(_Config.UserID, _Config.Password);
				console.log(`\n[qa-integration] authenticated as [${tmpSession.UserID}] customer [${tmpSession.CustomerID}] role [${tmpSession.UserRoleIndex}] against ${_ServerURL}`);
			});

		test(
			'baseline: unfiltered Sample count',
			async function()
			{
				const tmpPict = createServerSidePict(_Client, _ServerURL);
				const tmpMonitor = new EventLoopMonitor();
				const tmpLogMark = _Client.RequestLog.length;
				tmpMonitor.start();
				const tmpResult = await runCount(tmpPict, []);
				const tmpLoopStats = tmpMonitor.stop();
				reportScenario(`baseline count = ${JSON.stringify(tmpResult.Count)} in ${tmpResult.ElapsedMS}ms`, _Client, tmpLogMark, tmpLoopStats, tmpPict.CapturedWarnings);
				Expect(tmpResult.Count).to.be.a('number');
			});

		test(
			'discovers labs ranked by SampleLabJoin volume',
			async function()
			{
				const tmpPict = createServerSidePict(_Client, _ServerURL);
				const tmpLabs = await new Promise((resolve, reject) =>
				{
					tmpPict.EntityProvider.restClient.getJSON(`${_ServerURL}Labs/0/50`, (pError, pResponse, pBody) =>
					{
						return pError ? reject(pError) : resolve(pBody);
					});
				});
				Expect(tmpLabs).to.be.an('array');
				for (const tmpLab of tmpLabs)
				{
					const tmpJoinCount = await new Promise((resolve, reject) =>
					{
						tmpPict.EntityProvider.restClient.getJSON(`${_ServerURL}SampleLabJoins/Count/FilteredTo/FBV~IDLab~EQ~${tmpLab.IDLab}`, (pError, pResponse, pBody) =>
						{
							return pError ? reject(pError) : resolve((pBody && pBody.Count) || 0);
						});
					});
					_CandidateLabs.push({ IDLab: tmpLab.IDLab, Name: tmpLab.Name, JoinRows: tmpJoinCount });
				}
				_CandidateLabs.sort((a, b) => b.JoinRows - a.JoinRows);
				console.log(`\n[qa-integration] SampleLabJoin volume by lab (top 10):`);
				for (const tmpCandidate of _CandidateLabs.slice(0, 10))
				{
					console.log(`   IDLab ${tmpCandidate.IDLab} [${tmpCandidate.Name}] -> ${tmpCandidate.JoinRows} join rows`);
				}
				Expect(_CandidateLabs.length).to.be.greaterThan(0);
			});

		test(
			'incident shape: single join-clause count (DestinationLab via SampleLabJoin)',
			async function()
			{
				const tmpLabIDs = _CandidateLabs.slice(0, 2).map((c) => c.IDLab);
				const tmpPict = createServerSidePict(_Client, _ServerURL);
				const tmpMonitor = new EventLoopMonitor();
				const tmpLogMark = _Client.RequestLog.length;
				tmpMonitor.start();
				const tmpResult = await runCount(tmpPict, [ buildDestinationLabClause(tmpLabIDs) ]);
				const tmpLoopStats = tmpMonitor.stop();
				reportScenario(`join count (labs ${tmpLabIDs.join(',')}) = ${JSON.stringify(tmpResult.Count)} in ${tmpResult.ElapsedMS}ms`, _Client, tmpLogMark, tmpLoopStats, tmpPict.CapturedWarnings);
				Expect(tmpResult.Count).to.be.a('number');
			});

		test(
			'incident shape: page request for the same filter',
			async function()
			{
				const tmpLabIDs = _CandidateLabs.slice(0, 2).map((c) => c.IDLab);
				const tmpPict = createServerSidePict(_Client, _ServerURL);
				const tmpMonitor = new EventLoopMonitor();
				const tmpLogMark = _Client.RequestLog.length;
				tmpMonitor.start();
				const tmpResult = await runPage(tmpPict, [ buildDestinationLabClause(tmpLabIDs) ], 0, 50);
				const tmpLoopStats = tmpMonitor.stop();
				const tmpRecordCount = Array.isArray(tmpResult.Records) ? tmpResult.Records.length : 'n/a';
				reportScenario(`join page 0/50 (labs ${tmpLabIDs.join(',')}) = ${tmpRecordCount} records in ${tmpResult.ElapsedMS}ms`, _Client, tmpLogMark, tmpLoopStats, tmpPict.CapturedWarnings);
				Expect(tmpResult.Records).to.be.an('array');
			});

		test(
			'captured payload: replay a real browser request body (PICT_QA_PAYLOAD)',
			async function()
			{
				if (!process.env.PICT_QA_PAYLOAD)
				{
					this.skip();
					return;
				}
				const tmpPayload = JSON.parse(libFS.readFileSync(process.env.PICT_QA_PAYLOAD, 'utf8'));
				Expect(tmpPayload.Clauses, 'payload file must carry { Clauses: [...] } as captured from the browser POST body').to.be.an('array');
				const tmpPict = createServerSidePict(_Client, _ServerURL);
				const tmpMonitor = new EventLoopMonitor();
				const tmpLogMark = _Client.RequestLog.length;
				tmpMonitor.start();
				const tmpResult = await runCount(tmpPict, tmpPayload.Clauses);
				const tmpLoopStats = tmpMonitor.stop();
				reportScenario(`captured payload count = ${JSON.stringify(tmpResult.Count)} in ${tmpResult.ElapsedMS}ms`, _Client, tmpLogMark, tmpLoopStats, tmpPict.CapturedWarnings);
				Expect(tmpResult.Count).to.be.a('number');
			});

		test(
			`incident shape: ${CONCURRENT_COUNTS} concurrent counts (the kill pattern)`,
			async function()
			{
				const tmpLabIDs = _CandidateLabs.slice(0, 2).map((c) => c.IDLab);
				const tmpPicts = [];
				for (let i = 0; i < CONCURRENT_COUNTS; i++)
				{
					tmpPicts.push(createServerSidePict(_Client, _ServerURL));
				}
				const tmpMonitor = new EventLoopMonitor();
				const tmpLogMark = _Client.RequestLog.length;
				tmpMonitor.start();
				const tmpResults = await Promise.all(tmpPicts.map((pPict) => runCount(pPict, [ buildDestinationLabClause(tmpLabIDs) ])));
				const tmpLoopStats = tmpMonitor.stop();
				const tmpAllWarnings = tmpPicts.flatMap((pPict) => pPict.CapturedWarnings);
				reportScenario(`${CONCURRENT_COUNTS} concurrent counts = [${tmpResults.map((r) => JSON.stringify(r.Count)).join(', ')}] slowest ${Math.max(...tmpResults.map((r) => r.ElapsedMS))}ms`, _Client, tmpLogMark, tmpLoopStats, tmpAllWarnings);
				console.log(`\n[qa-integration] incident comparison: prod stall was ~14900ms of continuous blockage; Cattle kills at >8000ms of failed probes.`);
				for (const tmpResult of tmpResults)
				{
					Expect(tmpResult.Count).to.be.a('number');
				}
			});
	});
