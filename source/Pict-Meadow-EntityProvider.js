const libFableServiceBase = require('fable').ServiceProviderBase;

// Minimum meadow-endpoints version, per major, that serves the body-driven
// POST /:Entity/Query read route. The route was added in 2.1.0 and 4.1.0 but
// never shipped on the 3.x line or 4.0.x — so support is NOT monotonic across
// majors and a flat ">= x" comparison would be wrong. Used only as a fallback
// when the server does not advertise an explicit Capabilities flag.
const QUERY_ENDPOINT_MIN_VERSION_BY_MAJOR =
{
	2: '2.1.0',
	4: '4.1.0'
};

class PictMeadowEntityProvider extends libFableServiceBase
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, pOptions, pServiceHash);

		/** @type {any} */
		this.options;
		/** @type {import('./Pict') & { settings: any } & { newAnticipate: any }} */
		this.fable;
		/** @type {any} */
		this.log;

		this.serviceType = 'PictMeadowProvider';

		if (this.fable.settings.PictDefaultURLPrefix)
		{
			this.options.urlPrefix = this.fable.settings.PictDefaultURLPrefix;
		}
		else if (!this.options.urlPrefix)
		{
			this.options.urlPrefix = '/1.0/';
		}

		if (!this.options.downloadBatchSize)
		{
			if (typeof this.fable.settings.PictDefaultDownloadBatchSize === 'number')
			{
				this.options.downloadBatchSize = this.fable.settings.PictDefaultDownloadBatchSize;
			}
			else
			{
				this.options.downloadBatchSize = 100;
			}
		}

		if (typeof this.options.downloadPageConcurrency !== 'number')
		{
			this.options.downloadPageConcurrency = (typeof this.fable.settings.PictDefaultDownloadPageConcurrency === 'number')
				? this.fable.settings.PictDefaultDownloadPageConcurrency
				: 4;
		}

		if (typeof this.options.maxBundleConcurrency !== 'number')
		{
			this.options.maxBundleConcurrency = (typeof this.fable.settings.PictDefaultMaxBundleConcurrency === 'number')
				? this.fable.settings.PictDefaultMaxBundleConcurrency
				: 8;
		}

		//@ts-ignore - FIXME - remove once we have fable types
		this.restClient = this.fable.RestClient ?? this.fable.instantiateServiceProviderWithoutRegistration('RestClient');

		/** @type {Record<string, import('cachetrax')>} */
		this.recordCache = {};
		/** @type {Record<string, import('cachetrax')>} */
		this.recordSetCache = {};

		this.entityColumnTranslations = (
			{
				CreatingIDUser: 'User',
				UpdatingIDUser: 'User',
				DeletingIDUser: 'User'
			});

		/** @type {(pOptions: Record<string, any>) => Record<string, any>} */
		this.prepareRequestOptions = (pOptions) => { return pOptions; };

		/**
		 * After buildBundleWaves() is called by gatherDataFromServer(), this
		 * property holds the computed wave schedule for inspection/debugging.
		 * @type {Array<Array<{Index: number, Step: Record<string, any>}>>|null}
		 */
		this.lastBundleWaves = null;

		// Master switch for the body-driven POST /:Entity/Query transport. When
		// false the provider always uses the legacy GET reads (no capability
		// probe is ever issued). Defaults on; opt out via option or setting.
		if (typeof this.options.UseQueryEndpoint === 'boolean')
		{
			this.useQueryEndpoint = this.options.UseQueryEndpoint;
		}
		else if (typeof this.fable.settings.PictMeadowUseQueryEndpoint === 'boolean')
		{
			this.useQueryEndpoint = this.fable.settings.PictMeadowUseQueryEndpoint;
		}
		else
		{
			this.useQueryEndpoint = true;
		}

		/**
		 * Per-(urlPrefix, entity) capability cache. Different entities can resolve
		 * to different backend services (and thus different meadow-endpoints
		 * versions) behind the same urlPrefix, so support is cached per entity.
		 * @type {Record<string, { SupportsQuery: boolean, Metadata: (Record<string, any>|null) }>}
		 */
		this.endpointCapabilityCache = {};
		/**
		 * In-flight capability probes, keyed identically to the cache, so
		 * concurrent reads of the same entity collapse onto a single Schema probe.
		 * @type {Record<string, Array<(pError: Error|null, pSupportsQuery: boolean) => void>>}
		 */
		this.endpointCapabilityInflight = {};
	}

	/**
	 * Compute the capability cache key for an (entity, urlPrefix) pair.
	 *
	 * @param {string} pEntity - The entity name.
	 * @param {string} [pURLPrefix] - The URL prefix in play (defaults to the provider default).
	 * @return {string} The cache key.
	 */
	_capabilityKey(pEntity, pURLPrefix)
	{
		return `${pURLPrefix || this.options.urlPrefix}::${pEntity}`;
	}

	/**
	 * Major-version-aware check of whether a meadow-endpoints version string
	 * serves the POST /:Entity/Query route. Support is keyed off the major
	 * version (see QUERY_ENDPOINT_MIN_VERSION_BY_MAJOR) because the route was
	 * backported to 2.1.0 and added in 4.1.0, but absent on 3.x and 4.0.x.
	 *
	 * @param {string} pVersion - A semver string (e.g. '4.1.0').
	 * @return {boolean} True if the version is known to serve the Query route.
	 */
	isMeadowEndpointsVersionQueryCapable(pVersion)
	{
		if (typeof pVersion !== 'string')
		{
			return false;
		}
		const tmpParts = pVersion.split('.').map((pPart) => { return parseInt(pPart, 10); });
		if (tmpParts.length < 1 || isNaN(tmpParts[0]))
		{
			return false;
		}
		const tmpMajor = tmpParts[0];
		const tmpMinimum = QUERY_ENDPOINT_MIN_VERSION_BY_MAJOR[tmpMajor];
		if (!tmpMinimum)
		{
			return false;
		}
		const tmpMinimumParts = tmpMinimum.split('.').map((pPart) => { return parseInt(pPart, 10); });
		// Lexicographic compare of [major, minor, patch] with missing parts as 0.
		for (let i = 0; i < 3; i++)
		{
			const tmpHave = isNaN(tmpParts[i]) ? 0 : tmpParts[i];
			const tmpNeed = isNaN(tmpMinimumParts[i]) ? 0 : tmpMinimumParts[i];
			if (tmpHave > tmpNeed)
			{
				return true;
			}
			if (tmpHave < tmpNeed)
			{
				return false;
			}
		}
		return true;
	}

	/**
	 * Decide, from a Schema endpoint response body, whether the serving
	 * meadow-endpoints supports the POST /:Entity/Query route. An explicit
	 * Capabilities flag wins when present; otherwise fall back to a
	 * major-version-aware check of the advertised meadow-endpoints version.
	 * Servers that advertise nothing (older deployments) are unsupported.
	 *
	 * @param {Record<string, any>} pSchemaBody - The Schema endpoint response body.
	 * @return {boolean} True if POST /:Entity/Query is supported.
	 */
	evaluateQueryEndpointSupport(pSchemaBody)
	{
		if (!pSchemaBody || typeof pSchemaBody !== 'object')
		{
			return false;
		}
		const tmpMetadata = pSchemaBody.RetoldMetadata;
		if (!tmpMetadata || typeof tmpMetadata !== 'object')
		{
			return false;
		}
		if (tmpMetadata.Capabilities && typeof tmpMetadata.Capabilities.QueryEndpoint === 'boolean')
		{
			return tmpMetadata.Capabilities.QueryEndpoint;
		}
		const tmpVersion = tmpMetadata.PackageVersions && tmpMetadata.PackageVersions['meadow-endpoints'];
		if (typeof tmpVersion === 'string')
		{
			return this.isMeadowEndpointsVersionQueryCapable(tmpVersion);
		}
		return false;
	}

	/**
	 * Seed the capability cache for an entity from a Schema response the caller
	 * already has in hand (e.g. pict-section-recordset fetches the schema during
	 * initialization). Avoids a redundant capability probe.
	 *
	 * @param {string} pEntity - The entity name.
	 * @param {Record<string, any>} pSchemaBody - The Schema endpoint response body.
	 * @param {string} [pURLPrefix] - The URL prefix the schema was fetched from.
	 * @return {boolean} The resolved support value now cached.
	 */
	primeEntityCapabilityFromSchema(pEntity, pSchemaBody, pURLPrefix)
	{
		const tmpSupportsQuery = this.evaluateQueryEndpointSupport(pSchemaBody);
		this.endpointCapabilityCache[this._capabilityKey(pEntity, pURLPrefix)] =
			{
				SupportsQuery: tmpSupportsQuery,
				Metadata: (pSchemaBody && pSchemaBody.RetoldMetadata) || null
			};
		return tmpSupportsQuery;
	}

	/**
	 * Resolve whether POST /:Entity/Query is usable for an entity, probing the
	 * Schema endpoint once and caching the result per (urlPrefix, entity).
	 * Concurrent calls for the same key collapse onto a single probe.
	 *
	 * Probe failures (network/parse) are NOT cached — they resolve to false (GET
	 * fallback) for this call but allow a later retry, so a transient blip does
	 * not permanently disable the faster transport for the session. A successful
	 * probe of an older server (no metadata) caches false and never re-probes.
	 *
	 * @param {string} pEntity - The entity name.
	 * @param {string} pURLPrefix - The URL prefix in play.
	 * @param {(pError: Error|null, pSupportsQuery: boolean) => void} fCallback - Completion callback.
	 * @return {void}
	 */
	resolveEntityQuerySupport(pEntity, pURLPrefix, fCallback)
	{
		if (!this.useQueryEndpoint)
		{
			return fCallback(null, false);
		}
		const tmpKey = this._capabilityKey(pEntity, pURLPrefix);
		if (tmpKey in this.endpointCapabilityCache)
		{
			return fCallback(null, this.endpointCapabilityCache[tmpKey].SupportsQuery);
		}
		if (this.endpointCapabilityInflight[tmpKey])
		{
			this.endpointCapabilityInflight[tmpKey].push(fCallback);
			return;
		}
		this.endpointCapabilityInflight[tmpKey] = [ fCallback ];

		/** @type {Record<string, any>} */
		let tmpOptions = ({ url: `${pURLPrefix || this.options.urlPrefix}${pEntity}/Schema` });
		tmpOptions = this.prepareRequestOptions(tmpOptions);

		this.restClient.getJSON(tmpOptions,
			(pError, pResponse, pBody) =>
			{
				let tmpSupportsQuery = false;
				if (!pError)
				{
					try
					{
						tmpSupportsQuery = this.evaluateQueryEndpointSupport(pBody);
					}
					catch (pEvaluateError)
					{
						tmpSupportsQuery = false;
					}
					// Only cache on a clean probe; transient errors stay re-probeable.
					this.endpointCapabilityCache[tmpKey] =
						{
							SupportsQuery: tmpSupportsQuery,
							Metadata: (pBody && pBody.RetoldMetadata) || null
						};
				}
				else
				{
					this.log.warn(`EntityProvider capability probe for [${pEntity}] failed; falling back to GET reads: ${pError}`);
				}
				const tmpCallbacks = this.endpointCapabilityInflight[tmpKey];
				delete this.endpointCapabilityInflight[tmpKey];
				for (let i = 0; i < tmpCallbacks.length; i++)
				{
					tmpCallbacks[i](null, tmpSupportsQuery);
				}
			});
	}

	/**
	 * Decode a meadow filter expression for transport in a POST /:Entity/Query
	 * body. Filter values are built URL-encoded for the legacy GET reads (e.g.
	 * `%25...%25` for LIKE wildcards, encodeURIComponent'd distinct values),
	 * relying on the server URL-decoding the `:Filter` path segment of the GET
	 * route. The POST /Query route copies the body's Filter onto pRequest.params
	 * verbatim with no decode, so the encoding must be undone here to deliver the
	 * same value the GET path did. Malformed percent-sequences (a pre-existing
	 * GET-path hazard) fall back to the raw string so the POST path never fails
	 * where GET would not.
	 *
	 * @param {string} pMeadowFilterExpression - The (URL-encoded) meadow filter string.
	 * @return {string} The decoded filter string.
	 */
	_decodeFilterForQueryBody(pMeadowFilterExpression)
	{
		try
		{
			return decodeURIComponent(pMeadowFilterExpression);
		}
		catch (pDecodeError)
		{
			this.log.warn(`EntityProvider could not URL-decode filter [${pMeadowFilterExpression}] for POST /Query body; sending raw: ${pDecodeError}`);
			return pMeadowFilterExpression;
		}
	}

	/**
	 * Build the POST /:Entity/Query request body for a filtered read.
	 *
	 * @param {string} pMeadowFilterExpression - The meadow filter string (may be empty).
	 * @param {number|null} [pBegin] - Pagination start cursor.
	 * @param {number|null} [pCap] - Pagination page size.
	 * @param {Record<string, any>} [pProjection] - Optional { Mode:'LiteExtended', ExtraColumns:[...] }.
	 * @return {Record<string, any>} The request body envelope.
	 */
	_buildQueryReadBody(pMeadowFilterExpression, pBegin, pCap, pProjection)
	{
		/** @type {Record<string, any>} */
		const tmpBody = {};
		if (pMeadowFilterExpression)
		{
			tmpBody.Filter = this._decodeFilterForQueryBody(pMeadowFilterExpression);
		}
		if (typeof pBegin === 'number')
		{
			tmpBody.Begin = pBegin;
		}
		if (typeof pCap === 'number')
		{
			tmpBody.Cap = pCap;
		}
		if (pProjection && pProjection.Mode === 'LiteExtended' && Array.isArray(pProjection.ExtraColumns) && pProjection.ExtraColumns.length > 0)
		{
			// LiteExtended GET maps to a Lite read carrying ExtraColumns on Query.
			tmpBody.Lite = true;
			tmpBody.ExtraColumns = pProjection.ExtraColumns.join(',');
		}
		return tmpBody;
	}

	/**
	 * Read a page of an entity set, using POST /:Entity/Query when supported and
	 * falling back to the legacy GET read otherwise. The callback mirrors
	 * restClient.getJSON exactly: (pError, pResponse, pBody).
	 *
	 * @param {string} pEntity - The entity name.
	 * @param {string} pMeadowFilterExpression - The meadow filter string (may be empty).
	 * @param {number|null} pBegin - Pagination start cursor (null for unpaged).
	 * @param {number|null} pCap - Pagination page size (null for unpaged).
	 * @param {Record<string, any>} pReadOptions - { SupportsQuery, URLPrefix, Postfix, Projection }.
	 * @param {(pError: Error|null, pResponse: any, pBody: any) => void} fCallback - Completion callback.
	 * @return {void}
	 */
	_readEntityPage(pEntity, pMeadowFilterExpression, pBegin, pCap, pReadOptions, fCallback)
	{
		const tmpURLPrefix = (pReadOptions && pReadOptions.URLPrefix) || this.options.urlPrefix;
		const tmpPostfix = (pReadOptions && pReadOptions.Postfix) || '';
		const tmpProjection = pReadOptions ? pReadOptions.Projection : null;

		if (pReadOptions && pReadOptions.SupportsQuery)
		{
			const tmpRequestOptions = (
				{
					url: `${tmpURLPrefix}${pEntity}s/Query${tmpPostfix}`,
					body: this._buildQueryReadBody(pMeadowFilterExpression, pBegin, pCap, tmpProjection)
				});
			return this.restClient.postJSON(tmpRequestOptions, fCallback);
		}

		const tmpFilterStanza = pMeadowFilterExpression ? `/FilteredTo/${pMeadowFilterExpression}` : '';
		const tmpProjectionStanza = (tmpProjection && tmpProjection.Mode === 'LiteExtended' && Array.isArray(tmpProjection.ExtraColumns) && tmpProjection.ExtraColumns.length > 0)
			? `/LiteExtended/${tmpProjection.ExtraColumns.join(',')}`
			: '';
		const tmpPageStanza = (typeof pBegin === 'number' && typeof pCap === 'number') ? `/${pBegin}/${pCap}` : '';
		const tmpURL = `${tmpURLPrefix}${pEntity}s${tmpProjectionStanza}${tmpFilterStanza}${tmpPageStanza}${tmpPostfix}`;
		return this.restClient.getJSON(tmpURL, fCallback);
	}

	/**
	 * Read the count of an entity set, using POST /:Entity/Query (Count mode)
	 * when supported and the legacy GET Count otherwise. The callback mirrors
	 * restClient.getJSON: (pError, pResponse, pBody) where pBody carries .Count.
	 *
	 * @param {string} pEntity - The entity name.
	 * @param {string} pMeadowFilterExpression - The meadow filter string (may be empty).
	 * @param {Record<string, any>} pReadOptions - { SupportsQuery, URLPrefix, Postfix }.
	 * @param {(pError: Error|null, pResponse: any, pBody: any) => void} fCallback - Completion callback.
	 * @return {void}
	 */
	_readEntityCount(pEntity, pMeadowFilterExpression, pReadOptions, fCallback)
	{
		const tmpURLPrefix = (pReadOptions && pReadOptions.URLPrefix) || this.options.urlPrefix;
		const tmpPostfix = (pReadOptions && pReadOptions.Postfix) || '';

		if (pReadOptions && pReadOptions.SupportsQuery)
		{
			const tmpBody = this._buildQueryReadBody(pMeadowFilterExpression, null, null, null);
			tmpBody.Count = true;
			const tmpRequestOptions = (
				{
					url: `${tmpURLPrefix}${pEntity}s/Query${tmpPostfix}`,
					body: tmpBody
				});
			return this.restClient.postJSON(tmpRequestOptions, fCallback);
		}

		const tmpFilterStanza = pMeadowFilterExpression ? `/FilteredTo/${pMeadowFilterExpression}` : '';
		const tmpURL = `${tmpURLPrefix}${pEntity}s/Count${tmpFilterStanza}${tmpPostfix}`;
		return this.restClient.getJSON(tmpURL, fCallback);
	}

	/**
	 * Compute the cache bucket key for an entity, optionally namespaced by a scope.
	 * A non-empty scope yields an isolated bucket (`Entity::Scope`) so scoped/partial
	 * (e.g. Lite) records never touch the global `Entity` cache that full-record
	 * consumers ({~E:~}, read views, pickers) rely on. Empty scope === today's key.
	 * @param {string} pEntity - The entity name.
	 * @param {string} [pScope] - Optional cache scope.
	 * @return {string} The cache bucket key.
	 */
	_cacheKey(pEntity, pScope)
	{
		return pScope ? `${pEntity}::${pScope}` : pEntity;
	}

	/**
	 * @param {string} pEntity - The name of the entity to initialize the cache for
	 * @param {string} [pScope] - Optional cache scope to namespace the bucket.
	 */
	initializeCache(pEntity, pScope = '')
	{
		const tmpCacheKey = this._cacheKey(pEntity, pScope);
		// This should not be happening as often as it's happening.
		if (!(tmpCacheKey in this.recordCache))
		{
			//@ts-ignore - FIXME - remove once we have fable types
			this.recordCache[tmpCacheKey] = this.fable.instantiateServiceProviderWithoutRegistration('ObjectCache');
			// TODO: Make this a configuration?
			// For now cache for 30 seconds.
			this.recordCache[tmpCacheKey].maxAge = 30000;
			this.recordCache[tmpCacheKey].maxLength = 10000;

			this.fable.Bundle[tmpCacheKey] = this.recordCache[tmpCacheKey].RecordMap;
		}
		// This should not be happening as often as it's happening.
		if (!(tmpCacheKey in this.recordSetCache))
		{
			//@ts-ignore - FIXME - remove once we have fable types
			this.recordSetCache[tmpCacheKey] = this.fable.instantiateServiceProviderWithoutRegistration('ObjectCache');
			// TODO: Make this a configuration?
			// For now cache for 10 seconds.
			this.recordSetCache[tmpCacheKey].maxAge = 10000;
			this.recordSetCache[tmpCacheKey].maxLength = 100;
		}
	}

	/**
	 * Clear every cache bucket (record + record-set + Bundle map) belonging to a
	 * scope. Recordset lists call this at the start of each load (fresh prefetch,
	 * no stale list data) and on CRUD invalidation.
	 * @param {string} pScope - The cache scope to clear.
	 */
	clearScope(pScope)
	{
		if (!pScope)
		{
			return;
		}
		const tmpSuffix = `::${pScope}`;
		for (const tmpKey of Object.keys(this.recordCache))
		{
			if (tmpKey.endsWith(tmpSuffix))
			{
				delete this.recordCache[tmpKey];
				delete this.fable.Bundle[tmpKey];
			}
		}
		for (const tmpKey of Object.keys(this.recordSetCache))
		{
			if (tmpKey.endsWith(tmpSuffix))
			{
				delete this.recordSetCache[tmpKey];
			}
		}
	}

	/**
	 * @param {object} pEntityInformation - The entity information object.
	 * @param {object} pContext - The context object to use when parsing the filter template and assigning the results to the destination.
	 * @param {() => void} fCallback - The callback function to call when the operation is complete, which should take an optional error as its first parameter.
	 */
	gatherEntitySetCount(pEntityInformation, pContext, fCallback)
	{
		pEntityInformation.CountOnly = true;
		return this.gatherEntitySet(pEntityInformation, pContext, fCallback);
	}

	/**
	 * @param {Record<string, any>} pEntityInformation - The entity information object.
	 * @param {Record<string, any>} pContext - The context object to use when parsing the filter template and assigning the results to the destination.
	 * @param {(pError?: Error) => void} fCallback - The callback function to call when the operation is complete, which should take an optional error as its first parameter and the record set or count as its second parameter.
	 */
	gatherEntitySet(pEntityInformation, pContext, fCallback)
	{
		// First sanity check the pEntityInformation
		if (!('Entity' in pEntityInformation) || (typeof(pEntityInformation.Entity) != 'string'))
		{
			this.log.warn(`EntityBundleRequest failed to parse entity request because the entity stanza did not contain an Entity string.`);
			return fCallback();
		}
		if (!('Destination' in pEntityInformation) || (typeof(pEntityInformation.Destination) != 'string'))
		{
			this.log.warn(`EntityBundleRequest failed to parse entity request because the entity stanza did not contain a Destination string.`);
			return fCallback();
		}
		if (!('Filter' in pEntityInformation) || (typeof(pEntityInformation.Filter) != 'string'))
		{
			pEntityInformation.Filter = '';
		}
		if (!('FilterData' in pEntityInformation) || (typeof(pEntityInformation.FilterData) != 'object'))
		{
			pEntityInformation.FilterData = {};
		}
		pContext.StepData = pEntityInformation.FilterData;
		if (!('RecordStartCursor' in pEntityInformation) || (typeof(pEntityInformation.RecordStartCursor) != 'number'))
		{
			pEntityInformation.RecordStartCursor = 0;
		}
		//TODO: consider ChunkSize for cases when AllRecords is set and we want to control the to-server page size
		if (!('PageSize' in pEntityInformation) || (typeof(pEntityInformation.PageSize) != 'number'))
		{
			//TODO: this is a safety measure to try and not break things when we release this pict version; should be a lower value
			pEntityInformation.PageSize = 10000;
		}
		if (!('AllRecords' in pEntityInformation) || (typeof(pEntityInformation.AllRecords) != 'boolean'))
		{
			pEntityInformation.AllRecords = false;
		}

		let tmpRecordStartCursor = null;
		let tmpPageSize = null;
		if (pEntityInformation.PageSize)
		{
			tmpRecordStartCursor = pEntityInformation.RecordStartCursor;
			tmpPageSize = pEntityInformation.PageSize;
		}
		// Parse the filter template
		const tmpFilterString = this.fable.parseTemplate(pEntityInformation.Filter, pContext);

		// Create a callback function to handle receiving the record set
		const fRecordFetchComplete = (pError, pRecordSet) =>
		{
			if (pError)
			{
				this.log.error(`EntityBundleRequest request Error getting entity set for [${pEntityInformation.Entity}] with filter [${tmpFilterString}]: ${pError}`, pError);
				return fCallback(pError);
			}

			if (pEntityInformation.CountOnly)
			{
				this.log.trace(`EntityBundleRequest counted ${pRecordSet} records for ${pEntityInformation.Entity} filtered to [${tmpFilterString}]${!pEntityInformation.CountOnly && !pEntityInformation.AllRecords ? ` [${tmpRecordStartCursor}/${tmpPageSize}]` : ''}`);

				this.fable.manifest.setValueByHash(pContext, pEntityInformation.Destination, pRecordSet);
			}
			// Now assign it back to the destination; because this is not view specific it doesn't use the manifests from them (to deal with scope overlap with subgrids).
			else if (pEntityInformation.SingleRecord)
			{
				this.log.trace(`EntityBundleRequest found ${pRecordSet.length} records for ${pEntityInformation.Entity} filtered to [${tmpFilterString}]${!pEntityInformation.CountOnly && !pEntityInformation.AllRecords ? ` [${tmpRecordStartCursor}/${tmpPageSize}]` : ''}`);

				if (pRecordSet.length > 1)
				{
					this.log.warn(`EntityBundleRequest found more than one record for ${pEntityInformation.Entity} filtered to [${tmpFilterString}] but SingleRecord is true; setting the first record.`);
				}
				if (pRecordSet.length < 1)
				{
					this.fable.manifest.setValueByHash(pContext, pEntityInformation.Destination, false);
				}
				this.fable.manifest.setValueByHash(pContext, pEntityInformation.Destination, pRecordSet[0]);
			}
			else
			{
				this.log.trace(`EntityBundleRequest found ${pRecordSet.length} records for ${pEntityInformation.Entity} filtered to [${tmpFilterString}]${!pEntityInformation.CountOnly && !pEntityInformation.AllRecords ? ` [${tmpRecordStartCursor}/${tmpPageSize}]` : ''}`);

				this.fable.manifest.setValueByHash(pContext, pEntityInformation.Destination, pRecordSet);
			}

			return fCallback();
		};
		if (pEntityInformation.CountOnly)
		{
			this.getEntitySetRecordCount(pEntityInformation.Entity, tmpFilterString, fRecordFetchComplete, pEntityInformation.Postfix, pEntityInformation.URLPrefix);
		}
		else if (tmpPageSize && !pEntityInformation.AllRecords)
		{
			this.getEntitySetPage(pEntityInformation.Entity, tmpFilterString, tmpRecordStartCursor, tmpPageSize, fRecordFetchComplete, pEntityInformation.Postfix, pEntityInformation.URLPrefix, { Scope: pEntityInformation.Scope, Projection: pEntityInformation.Projection });
		}
		else
		{
			this.getEntitySet(pEntityInformation.Entity, tmpFilterString, fRecordFetchComplete, pEntityInformation.Postfix, pEntityInformation);
		}
	}

	/**
	 * @param {Record<string, any>} pDestinationEntity - The destination entity to map the join results to.
	 * @param {Record<string, any>} pCustomRequestInformation - The custom request information object.
	 * @param {Record<string, any>} pContext - The context object to use when parsing templates and resolving addresses.
	 */
	mapJoinSingleDestination(pDestinationEntity, pCustomRequestInformation, pContext)
	{
		const tmpSourceEntities = this.fable.manifest.getValueByHash(pContext, pCustomRequestInformation.JoinRecordSetAddress);
		if (!Array.isArray(tmpSourceEntities))
		{
			throw new Error(`EntityBundleRequest failed to map join because the source [${pCustomRequestInformation.JoinRecordSetAddress}] did not return an array.`);
		}

		const tmpSourceLookup = {};
		for (const tmpSourceEntity of tmpSourceEntities)
		{
			const tmpSourceJoinValue = tmpSourceEntity[pCustomRequestInformation.JoinValue];
			tmpSourceLookup[tmpSourceJoinValue] = tmpSourceEntity;
		}

		for (const tmpSourceEntity of tmpSourceEntities)
		{
			if (!tmpSourceEntity)
			{
				this.log.error(`EntityBundleRequest failed to map join because the source entity was not found in the source lookup.`);
				continue;
			}
			if (pCustomRequestInformation.BucketBy || pCustomRequestInformation.BucketByTemplate)
			{
				const tmpBucketValues = [];
				if (pCustomRequestInformation.BucketBy)
				{
					const tmpBucketByKeys = Array.isArray(pCustomRequestInformation.BucketBy) ? pCustomRequestInformation.BucketBy : [pCustomRequestInformation.BucketBy];
					for (const tmpBucketByKey of tmpBucketByKeys)
					{
						const tmpBucketValue = this.fable.manifest.getValueByHash(tmpSourceEntity, tmpBucketByKey);
						tmpBucketValues.push(tmpBucketValue);
					}
				}
				else
				{
					const tmpBucketByTemplates = Array.isArray(pCustomRequestInformation.BucketByTemplate) ? pCustomRequestInformation.BucketByTemplate : [pCustomRequestInformation.BucketByTemplate];
					for (const tmpBucketByTemplate of tmpBucketByTemplates)
					{
						const tmpBucketValue = this.fable.parseTemplate(tmpBucketByTemplate, tmpSourceEntity);
						if (tmpBucketValue)
						{
							tmpBucketValues.push(tmpBucketValue);
						}
					}
				}
				if (tmpBucketValues.length < 1)
				{
					if (this.fable.LogNoisiness > 0)
					{
						this.log.warn(`EntityBundleRequest failed to map join because no bucket values were found.`, { pCustomRequestInformation, tmpSourceEntity });
					}
				}
				else
				{
					const tmpBucketAddress = `${pCustomRequestInformation.RecordDestinationAddress}.${tmpBucketValues.join('.')}`;
					if (pCustomRequestInformation.SingleRecord)
					{
						//TODO: warn if there is a collision?
						this.fable.manifest.setValueByHash(pDestinationEntity, tmpBucketAddress, tmpSourceEntity);
					}
					else
					{
						let tmpBucketArray = this.fable.manifest.getValueByHash(pDestinationEntity, tmpBucketAddress, tmpSourceEntity);
						if (!tmpBucketArray)
						{
							tmpBucketArray = [];
							this.fable.manifest.setValueByHash(pDestinationEntity, tmpBucketAddress, tmpBucketArray);
						}
						tmpBucketArray.push(tmpSourceEntity);
					}
				}
			}
			else if (pCustomRequestInformation.SingleRecord)
			{
				if (pDestinationEntity[pCustomRequestInformation.RecordDestinationAddress] && this.fable.LogNoisiness > 1)
				{
					this.fable.log.warn(`EntityBundleRequest found more than one record for [${pCustomRequestInformation.RecordDestinationAddress}] in mapJoin mapped as SingleRecord.`);
				}
				pDestinationEntity[pCustomRequestInformation.RecordDestinationAddress] = tmpSourceEntity;
			}
			else
			{
				pDestinationEntity[pCustomRequestInformation.RecordDestinationAddress] = pDestinationEntity[pCustomRequestInformation.RecordDestinationAddress] || [];
				pDestinationEntity[pCustomRequestInformation.RecordDestinationAddress].push(tmpSourceEntity);
			}
		}
		return [pDestinationEntity];
	}

	/**
	 * @param {Record<string, any>} pCustomRequestInformation - The custom request information object.
	 * @param {Record<string, any>} pContext - The context object to use when parsing templates and resolving addresses.
	 */
	mapJoin(pCustomRequestInformation, pContext)
	{
		const tmpSingleDestinationEntity = pCustomRequestInformation.DestinationRecordAddress ? this.fable.manifest.getValueByHash(pContext, pCustomRequestInformation.DestinationRecordAddress) : null;
		const tmpDestinationEntities = pCustomRequestInformation.DestinationRecordSetAddress ? this.fable.manifest.getValueByHash(pContext, pCustomRequestInformation.DestinationRecordSetAddress) : null;
		if (!Array.isArray(tmpDestinationEntities) && !tmpSingleDestinationEntity)
		{
			throw new Error(`EntityBundleRequest failed to map join because the destination [${pCustomRequestInformation.DestinationRecordSetAddress}] did not return an array.`);
		}
		if (tmpSingleDestinationEntity)
		{
			return this.mapJoinSingleDestination(tmpSingleDestinationEntity, pCustomRequestInformation, pContext);
		}

		const tmpJoinEntities = this.fable.manifest.getValueByHash(pContext, pCustomRequestInformation.Joins);
		if (!Array.isArray(tmpJoinEntities))
		{
			throw new Error(`EntityBundleRequest failed to map join because the join [${pCustomRequestInformation.Joins}] did not return an array.`);
		}
		const tmpSourceEntities = this.fable.manifest.getValueByHash(pContext, pCustomRequestInformation.JoinRecordSetAddress);
		if (!Array.isArray(tmpSourceEntities))
		{
			throw new Error(`EntityBundleRequest failed to map join because the source [${pCustomRequestInformation.JoinRecordSetAddress}] did not return an array.`);
		}

		const tmpLHSJoinKey = pCustomRequestInformation.JoinJoinValueLHS || pCustomRequestInformation.DestinationJoinValue;
		const tmpRHSJoinKey = pCustomRequestInformation.JoinJoinValueRHS || pCustomRequestInformation.JoinValue;
		const tmpDestinationLookup = {};
		const tmpSourceLookup = {};
		const tmpJoinMap = {};
		for (const tmpDestinationEntity of tmpDestinationEntities || [])
		{
			const tmpDestinationJoinValue = tmpDestinationEntity[pCustomRequestInformation.DestinationJoinValue];
			tmpDestinationLookup[tmpDestinationJoinValue] = tmpDestinationEntity;
		}
		for (const tmpSourceEntity of tmpSourceEntities)
		{
			const tmpSourceJoinValue = tmpSourceEntity[pCustomRequestInformation.JoinValue];
			tmpSourceLookup[tmpSourceJoinValue] = tmpSourceEntity;
		}

		for (const tmpJoinEntity of tmpJoinEntities)
		{
			const tmpLHSJoinValue = tmpJoinEntity[tmpLHSJoinKey];
			const tmpRHSJoinValue = tmpJoinEntity[tmpRHSJoinKey];
			tmpJoinMap[tmpLHSJoinValue] = tmpJoinMap[tmpLHSJoinValue] || new Set();
			tmpJoinMap[tmpLHSJoinValue].add(tmpRHSJoinValue);
		}

		for (const tmpLHSJoinValue of Object.keys(tmpJoinMap))
		{
			const tmpRHSJoinValues = Array.from(tmpJoinMap[tmpLHSJoinValue]);
			const tmpDestinationEntity = tmpDestinationLookup[tmpLHSJoinValue];
			if (!tmpDestinationEntity)
			{
				this.log.error(`EntityBundleRequest failed to map join because the LHS join value [${tmpLHSJoinValue}] was not found in the destination lookup.`);
				continue;
			}
			for (const tmpRHSJoinValue of tmpRHSJoinValues)
			{
				const tmpSourceEntity = tmpSourceLookup[tmpRHSJoinValue];
				if (!tmpSourceEntity)
				{
					this.log.error(`EntityBundleRequest failed to map join because the RHS join value [${tmpRHSJoinValue}] was not found in the source lookup.`);
					continue;
				}
				if (pCustomRequestInformation.BucketBy || pCustomRequestInformation.BucketByTemplate)
				{
					const tmpBucketValues = [];
					if (pCustomRequestInformation.BucketBy)
					{
						const tmpBucketByKeys = Array.isArray(pCustomRequestInformation.BucketBy) ? pCustomRequestInformation.BucketBy : [pCustomRequestInformation.BucketBy];
						for (const tmpBucketByKey of tmpBucketByKeys)
						{
							const tmpBucketValue = this.fable.manifest.getValueByHash(tmpSourceEntity, tmpBucketByKey);
							tmpBucketValues.push(tmpBucketValue);
						}
					}
					else
					{
						const tmpBucketByTemplates = Array.isArray(pCustomRequestInformation.BucketByTemplate) ? pCustomRequestInformation.BucketByTemplate : [pCustomRequestInformation.BucketByTemplate];
						for (const tmpBucketByTemplate of tmpBucketByTemplates)
						{
							const tmpBucketValue = this.fable.parseTemplate(tmpBucketByTemplate, tmpSourceEntity);
							tmpBucketValues.push(tmpBucketValue);
						}
					}
					if (!tmpDestinationEntity[pCustomRequestInformation.RecordDestinationAddress])
					{
						tmpDestinationEntity[pCustomRequestInformation.RecordDestinationAddress] = {};
					}
					const tmpBucketAddress = `${pCustomRequestInformation.RecordDestinationAddress}.${tmpBucketValues.join('.')}`;
					if (pCustomRequestInformation.SingleRecord)
					{
						//TODO: warn if there is a collision?
						this.fable.manifest.setValueByHash(tmpDestinationEntity, tmpBucketAddress, tmpSourceEntity);
					}
					else
					{
						let tmpBucketArray = this.fable.manifest.getValueByHash(tmpDestinationEntity, tmpBucketAddress, tmpSourceEntity);
						if (!tmpBucketArray)
						{
							tmpBucketArray = [];
							this.fable.manifest.setValueByHash(tmpDestinationEntity, tmpBucketAddress, tmpBucketArray);
						}
						tmpBucketArray.push(tmpSourceEntity);
					}
				}
				else if (pCustomRequestInformation.SingleRecord)
				{
					if (tmpDestinationEntity[pCustomRequestInformation.RecordDestinationAddress] && this.fable.LogNoisiness > 1)
					{
						this.fable.log.warn(`EntityBundleRequest found more than one record for [${pCustomRequestInformation.RecordDestinationAddress}] in mapJoin mapped as SingleRecord.`);
					}
					tmpDestinationEntity[pCustomRequestInformation.RecordDestinationAddress] = tmpSourceEntity;
				}
				else
				{
					tmpDestinationEntity[pCustomRequestInformation.RecordDestinationAddress] = tmpDestinationEntity[pCustomRequestInformation.RecordDestinationAddress] || [];
					tmpDestinationEntity[pCustomRequestInformation.RecordDestinationAddress].push(tmpSourceEntity);
				}
			}
		}
		return tmpDestinationEntities;
	}

	/**
	 * ExampleConfig:
	 * {
	 *      "InputRecordsetAddress": "AppData.DocumentData.ReportData.Observations[]<<~?ObservationType,==,WalbecNDTRollerTests?~>>",
	 *      "OutputRecordsetAddress": "AppData.DocumentData.ReportData.FormData.ADDTests",
	 * 		"OutputRecordsetAddressMapping":
	 *      {
	 * 			"InputRecord.Tags[],AnyContains,HR": "AppData.DocumentData.ReportData.FormData.HRTests",
	 * 			"InputRecord.Tags[],AnyContains,CR": "AppData.DocumentData.ReportData.FormData.CRTests",
	 * 			"InputRecord.Tags[],AnyContains,IR": "AppData.DocumentData.ReportData.FormData.IRTests"
	 *      },
	 * 		"RecordPrototypeAddress": "OutputRecordSet[]<<~?IDObservation,==,{~D:InputRecord.IDObservation~}?~>>",
	 * 		"RecordFieldMapping":
	 *      {
	 * 			"AppData.DocumentData.ReportData.FormData.HRTests":
	 *          {
	 *               "InputRecord.Details.WalbecNDTRollerTests[0].Datum.MaterialTemperature": "OutputRecord.Temp",
	 *               "InputRecord.Details.WalbecNDTRollerTests[0].Datum.PercentDensity": "OutputRecord.Density",
	 *               "InputRecord.Details.WalbecNDTRollerTests[0].Datum.Offset": "OutputRecord.Offset",
	 *               "InputRecord.IDObservation": "OutputRecord.IDObservation"
	 *          },
	 * 			"AppData.DocumentData.ReportData.FormData.CRTests":
	 *          {
	 *               "InputRecord.Details.WalbecNDTRollerTests[0].Datum.MaterialTemperature": "OutputRecord.CRTemp",
	 *               "InputRecord.Details.WalbecNDTRollerTests[0].Datum.PercentDensity": "OutputRecord.CRDensity",
	 *               "InputRecord.Details.WalbecNDTRollerTests[0].Datum.Offset": "OutputRecord.CROffset",
	 *               "InputRecord.IDObservation": "OutputRecord.IDObservation"
	 *          },
	 * 			"AppData.DocumentData.ReportData.FormData.IRTests":
	 *          {
	 *               "InputRecord.Details.WalbecNDTRollerTests[0].Datum.MaterialTemperature": "OutputRecord.IRTemp",
	 *               "InputRecord.Details.WalbecNDTRollerTests[0].Datum.PercentDensity": "OutputRecord.IRDensity",
	 *               "InputRecord.Details.WalbecNDTRollerTests[0].Datum.Offset": "OutputRecord.IROffset",
	 *               "InputRecord.IDObservation": "OutputRecord.IDObservation"
	 *          },
	 *          "Default":
	 *          {
	 *               "InputRecord.Details.WalbecNDTRollerTests[0].Datum.MaterialTemperature": "OutputRecord.ADDTemp",
	 *               "InputRecord.Details.WalbecNDTRollerTests[0].Datum.PercentDensity": "OutputRecord.ADDDensity",
	 *               "InputRecord.Details.WalbecNDTRollerTests[0].Datum.Offset": "OutputRecord.ADDOffset",
	 *               "InputRecord.IDObservation": "OutputRecord.IDObservation"
	 *          }
	 *      }
	 * }
	 *
	 * @param {Record<string, any>} pConfiguration - The configuration object for the dataset projection.
	 * @param {Record<string, any>} pContext - The context object to use when parsing the record prototype template and resolving the output recordset address mapping.
	 */
	projectDataset(pConfiguration, pContext)
	{
		let tmpInputRecordset = this.fable.manifest.getValueByHash(pContext, pConfiguration.InputRecordsetAddress);
		if (tmpInputRecordset == null || typeof tmpInputRecordset !== 'object')
		{
			throw new Error(`EntityBundleRequest failed to project dataset because the input recordset [${pConfiguration.InputRecordsetAddress}] did not return an valid object.`);
		}
		if (!Array.isArray(tmpInputRecordset))
		{
			tmpInputRecordset = [ tmpInputRecordset ];
		}
		let tmpDefaultOutputRecordset = this.fable.manifest.getValueByHash(pContext, pConfiguration.OutputRecordsetAddress);
		if (!tmpDefaultOutputRecordset)
		{
			tmpDefaultOutputRecordset = [];
			this.fable.manifest.setValueByHash(pContext, pConfiguration.OutputRecordsetAddress, tmpDefaultOutputRecordset);
		}
		for (const tmpInputRecord of tmpInputRecordset)
		{
			let tmpOutputRecordset = tmpDefaultOutputRecordset;
			let tmpOutputRecordsetAddressOverride;
			if (typeof pConfiguration.OutputRecordsetAddressMapping === 'object')
			{
				tmpOutputRecordsetAddressOverride = this._resolveOutputRecordsetAddressMapping(pConfiguration, pContext, tmpInputRecord);
				if (tmpOutputRecordsetAddressOverride)
				{
					tmpOutputRecordset = this.fable.manifest.getValueByHash(pContext, tmpOutputRecordsetAddressOverride);
					if (!tmpOutputRecordset)
					{
						tmpOutputRecordset = [];
						this.fable.manifest.setValueByHash(pContext, tmpOutputRecordsetAddressOverride, tmpOutputRecordset);
					}
				}
				if (!tmpOutputRecordset || !Array.isArray(tmpOutputRecordset))
				{
					tmpOutputRecordset = tmpDefaultOutputRecordset;
				}
			}
			const tmpPrototypeAddress = this.fable.parseTemplate(pConfiguration.RecordPrototypeAddress, Object.assign({ InputRecord: tmpInputRecord }, pContext));
			const tmpRecordPrototype = this.fable.manifest.getValueByHash(Object.assign({ InputRecord: tmpInputRecord, OutputRecordset: tmpOutputRecordset }, pContext), tmpPrototypeAddress);
			let tmpOutputRecord = { };
			if (Array.isArray(tmpRecordPrototype) && tmpRecordPrototype.length > 0)
			{
				tmpOutputRecord = tmpRecordPrototype[0];
			}
			else
			{
				tmpOutputRecordset.push(tmpOutputRecord);
			}
			let tmpRecordFieldMapping = pConfiguration.RecordFieldMapping[tmpOutputRecordsetAddressOverride] || pConfiguration.RecordFieldMapping.Default;
			if (!tmpRecordFieldMapping)
			{
				tmpRecordFieldMapping = pConfiguration.RecordFieldMapping[Object.keys(pConfiguration.RecordFieldMapping)[0]];
			}
			if (!tmpRecordFieldMapping)
			{
				throw new Error(`EntityBundleRequest failed to project dataset because the record field mapping for [${tmpOutputRecordsetAddressOverride}] did not return a mapping.`);
			}
			for (const tmpInputFieldAddress of Object.keys(tmpRecordFieldMapping))
			{
				const tmpOutputFieldAddress = tmpRecordFieldMapping[tmpInputFieldAddress];
				const tmpInputFieldValue = this.fable.manifest.getValueByHash(Object.assign({ InputRecord: tmpInputRecord }, pContext), tmpInputFieldAddress);
				this.fable.manifest.setValueByHash(Object.assign({ OutputRecord: tmpOutputRecord }, pContext), tmpOutputFieldAddress, tmpInputFieldValue);
			}
		}
	}

	/**
	 * @param {Record<string, any>} pConfiguration - The configuration object for the dataset projection.
	 * @param {Record<string, any>} pContext - The context object to use when resolving the output recordset address mapping.
	 * @param {Record<string, any>} pInputRecord - The input record to use when resolving the output recordset address mapping.
	 *
	 * @return {string|null} - The resolved output recordset address, or null if no mapping was found.
	 */
	_resolveOutputRecordsetAddressMapping(pConfiguration, pContext, pInputRecord)
	{
		const tmpAddressSpace = Object.assign({ InputRecord: pInputRecord }, pContext);
		for (const tmpRule of Object.keys(pConfiguration.OutputRecordsetAddressMapping))
		{
			const [ tmpLHSAddress, tmpOperator, tmpMatchValue ] = tmpRule.split(',');
			const tmpLHS = this.fable.manifest.getValueByHash(tmpAddressSpace, tmpLHSAddress);
			if (!tmpLHS)
			{
				if (this.fable.LogNoisiness > 0)
				{
					this.log.warn(`EntityBundleRequest failed to project dataset because the LHS address [${tmpLHSAddress}] did not return a value.`);
				}
				continue;
			}
			switch (tmpOperator)
			{
				case 'AnyContains':
					if (!Array.isArray(tmpLHS))
					{
						//TODO: consider making this use objects as well?
						this.log.error(`EntityBundleRequest failed to project dataset because the LHS address [${tmpLHSAddress}] did not return an array.`);
						continue;
					}
					for (const tmpLHSValue of tmpLHS)
					{
						if (String(tmpLHSValue).includes(tmpMatchValue))
						{
							return pConfiguration.OutputRecordsetAddressMapping[tmpRule];
						}
					}
			}
		}
		return null;
	}

	/**
	 * @param {Record<string, any>} pCustomRequestInformation - The custom request information object.
	 * @param {Record<string, any>} pContext - The context object to use when parsing templates and resolving addresses.
	 * @param {(pError?: Error) => void} fCallback - The callback function to call when the operation is complete, which should take an optional error as its first parameter and the data set as its second parameter.
	 */
	gatherCustomDataSet(pCustomRequestInformation, pContext, fCallback)
	{
		// First sanity check the pCustomRequestInformation
		if (!('URL' in pCustomRequestInformation) || (typeof(pCustomRequestInformation.URL) != 'string'))
		{
			this.log.warn(`EntityBundleRequest failed to parse custom data request because the stanza did not contain a URL string.`);
			return fCallback();
		}
		if (!('URLData' in pCustomRequestInformation) || (typeof(pCustomRequestInformation.URLData) != 'object'))
		{
			pCustomRequestInformation.URLData = {};
		}
		pContext.StepData = pCustomRequestInformation.URLData;
		// Parse the filter template
		const tmpURLTemplateString = this.fable.parseTemplate(pCustomRequestInformation.URL, pContext);
		if (tmpURLTemplateString == '')
		{
			// We may want to continue, but for now let's say nah and nope out.
			this.log.warn(`EntityBundleRequest failed to parse custom data request because the entity Filter did not return a string for FilterBy`)
		}

		let tmpURLPrefix = '';
		// This will only be true if the "Host" is set.
		const tmpCustomURIHost = pCustomRequestInformation.Host ? pCustomRequestInformation.Host : false;
		// If "Host" is set, protocol and port are optional.
		const tmpCustomURIProtocol = pCustomRequestInformation.Protocol ? pCustomRequestInformation.Protocol : 'https';
		const tmpCustomURIPort = pCustomRequestInformation.Port ? pCustomRequestInformation.Port : false;

		if (tmpCustomURIHost)
		{
			tmpURLPrefix = `${tmpCustomURIProtocol}://${tmpCustomURIHost}`;
			if (tmpCustomURIPort)
			{
				tmpURLPrefix += `:${tmpCustomURIPort}`;
			}
		}
		else
		{
			tmpURLPrefix = this.fable.EntityProvider.options.urlPrefix;
		}

		// Now get the records
		/** @type {(pError: Error | null, pResponse: any, pData: any) => void} */
		const callback = (pError, pResponse, pData) =>
		{
			if (pError)
			{
				this.log.error(`EntityBundleRequest request Error getting data set for [${pCustomRequestInformation.Entity}] with filter [${tmpURLTemplateString}]: ${pError}`, pError);
				return fCallback(pError);
			}

			this.log.trace(`EntityBundleRequest completed request for ${pCustomRequestInformation.Entity} filtered to [${tmpURLTemplateString}]`);

			// Since this is a templated endpoint it can be used for logging etc.
			if (pCustomRequestInformation.Destination)
			{
				this.fable.manifest.setValueByHash(pContext, pCustomRequestInformation.Destination, pData);
			}

			return fCallback();
		};

		/** @type {Record<string, any>} */
		let tmpOptions = (
			{
				url: `${tmpURLPrefix}${tmpURLTemplateString}`
			});
		tmpOptions = this.fable.EntityProvider.prepareRequestOptions(tmpOptions);
		return this.fable.EntityProvider.restClient.getJSON(tmpOptions, callback);
	}

	/**
	 * Local version of gatherDataFromServer that only support synchronous operations.
	 *
	 * @param {Array<Record<string, any>>} pEntitiesBundleDescription - The entity bundle description object.
	 */
	processBundle(pEntitiesBundleDescription)
	{
		if (!Array.isArray(pEntitiesBundleDescription))
		{
			this.log.error(`EntityBundleRequest failed to parse entity bundle request because the input was not an array.`);
			throw new Error('EntityBundleRequest failed to parse entity bundle request because the input was not an array.');
		}

		const tmpStateStack = [];
		let tmpState = {};

		for (const tmpEntityBundleEntry of pEntitiesBundleDescription)
		{
			try
			{
				switch (tmpEntityBundleEntry.Type)
				{
					case 'SetStateAddress':
						tmpStateStack.push(tmpState);
						tmpState = this.fable.manifest.getValueByHash(this.fable, tmpEntityBundleEntry.StateAddress);
						if (typeof tmpState === 'undefined')
						{
							tmpState = {};
							this.fable.manifest.setValueByHash(this.fable, tmpEntityBundleEntry.StateAddress, tmpState);
						}
						break;
					case 'PopState':
						if (tmpStateStack.length > 0)
						{
							tmpState = tmpStateStack.pop();
						}
						else
						{
							this.log.warn(`EntityBundleRequest encountered a PopState without a matching SetStateAddress.`);
						}
						break;
					case 'MapJoin':
						this.mapJoin(tmpEntityBundleEntry, this.prepareState(tmpState, tmpEntityBundleEntry));
						break;
					case 'ProjectDataset':
						this.projectDataset(tmpEntityBundleEntry, this.prepareState(tmpState, tmpEntityBundleEntry));
						break;
					default:
						this.log.error(`EntityBundleRequest encountered an unsupported type [${tmpEntityBundleEntry.Type}] in the entity bundle description.`);
				}
			}
			catch (pError)
			{
				this.log.error(`EntityBundleRequest error gathering entity set: ${pError}`, { Stack: pError.stack });
			}
		}
	}

	/**
	 * Gather data from the server returning a promise when it is complete.
	 *
	 * @param {Array<Record<string, any>>} pEntitiesBundleDescription - The entity bundle description object.
	 * @param {(error?: Error) => void} fCallback - The callback function to call when the data gathering is complete.
	 */
	/**
	 * Extract the set of destination addresses that a bundle step depends on.
	 *
	 * Scans the step's Filter, URL, and data-address properties for template
	 * references of the form:
	 *   - {~PJU:..^Field^SomeAddress~}  (primary-key join/unique)
	 *   - {~D:SomeAddress.Field~}        (data-address lookup)
	 *
	 * Also inspects MapJoin/ProjectDataset address properties for references
	 * to destinations produced by earlier steps.
	 *
	 * @param {Record<string, any>} pStep - A single entity bundle step.
	 * @return {Set<string>} - The set of destination address prefixes this step references.
	 */
	extractStepDependencies(pStep)
	{
		const tmpDependencies = new Set();

		// Collect all string fields that may contain template expressions
		const tmpTemplateFields = [];
		if (typeof pStep.Filter === 'string')
		{
			tmpTemplateFields.push(pStep.Filter);
		}
		if (typeof pStep.URL === 'string')
		{
			tmpTemplateFields.push(pStep.URL);
		}
		if (typeof pStep.BucketByTemplate === 'string')
		{
			tmpTemplateFields.push(pStep.BucketByTemplate);
		}

		/**
		 * Add a dependency address, stripping the Record. prefix if present.
		 * The Record. prefix is used in PJU/D templates because the template
		 * parser receives a context object with Record as a root property,
		 * but the actual data address is everything after Record.
		 *
		 * @param {string} pValue - The raw address from the template or step config.
		 */
		const addDependency = (pValue) =>
		{
			if (typeof pValue === 'string' && pValue.startsWith('Record.'))
			{
				tmpDependencies.add(pValue.substring('Record.'.length));
			}
			else
			{
				tmpDependencies.add(pValue);
			}
		};

		// Parse template references from Filter/URL strings
		for (const tmpField of tmpTemplateFields)
		{
			// Match {~PJU:..^Field^Address.Path~} — the address is after the last ^
			// Address characters include alphanumerics, dots, brackets, hyphens (e.g. State[Step-1])
			const tmpPJUMatches = tmpField.matchAll(/\^([^~}^]+)~\}/g);
			for (const tmpMatch of tmpPJUMatches)
			{
				addDependency(tmpMatch[1]);
			}
			// Match {~D:Address.Path.Field~}
			const tmpDMatches = tmpField.matchAll(/\{~D:([^~}]+)~\}/g);
			for (const tmpMatch of tmpDMatches)
			{
				addDependency(tmpMatch[1]);
			}
		}

		// MapJoin steps reference data from prior steps via address properties
		if (pStep.Type === 'MapJoin')
		{
			if (typeof pStep.DestinationRecordSetAddress === 'string')
			{
				addDependency(pStep.DestinationRecordSetAddress);
			}
			if (typeof pStep.DestinationRecordAddress === 'string')
			{
				addDependency(pStep.DestinationRecordAddress);
			}
			if (typeof pStep.Joins === 'string')
			{
				addDependency(pStep.Joins);
			}
			if (typeof pStep.JoinRecordSetAddress === 'string')
			{
				addDependency(pStep.JoinRecordSetAddress);
			}
		}

		// ProjectDataset steps reference input recordset addresses
		if (pStep.Type === 'ProjectDataset')
		{
			if (typeof pStep.InputRecordsetAddress === 'string')
			{
				// Strip any manyfest filter expression from the address
				const tmpCleanAddress = pStep.InputRecordsetAddress.split('[]')[0];
				addDependency(tmpCleanAddress);
			}
		}
		return tmpDependencies;
	}

	/**
	 * Build execution waves from a bundle description by analyzing inter-step
	 * dependencies. Steps within the same wave have no data dependencies on
	 * each other and can execute concurrently. Waves execute sequentially.
	 *
	 * SetStateAddress and PopState steps act as wave barriers — they always
	 * start a new wave and execute alone.
	 *
	 * @param {Array<Record<string, any>>} pEntitiesBundleDescription - The entity bundle description.
	 * @return {Array<Array<{Index: number, Step: Record<string, any>}>>} - An array of waves, each wave an array of {Index, Step} objects.
	 */
	buildBundleWaves(pEntitiesBundleDescription)
	{
		// First, annotate each step with its dependencies and destination
		const tmpAnnotatedSteps = [];
		for (let i = 0; i < pEntitiesBundleDescription.length; i++)
		{
			const tmpStep = pEntitiesBundleDescription[i];
			// MapJoin and ProjectDataset are synchronous steps that mutate records
			// in-place, creating implicit data dependencies that can't be reliably
			// detected from the step config alone. Force them to run sequentially.
			const tmpIsSyncMutation = (tmpStep.Type === 'MapJoin' || tmpStep.Type === 'ProjectDataset');
			tmpAnnotatedSteps.push({
				Index: i,
				Step: tmpStep,
				Destination: typeof tmpStep.Destination === 'string' ? tmpStep.Destination : null,
				Dependencies: this.extractStepDependencies(tmpStep),
				IsBarrier: (tmpStep.Type === 'SetStateAddress' || tmpStep.Type === 'PopState'),
				// Allow individual steps to opt out of parallel execution.
				// Sync mutation steps are always sequential unless explicitly overridden.
				ForceSequential: tmpIsSyncMutation ? (tmpStep.Parallel !== true) : (tmpStep.Parallel === false)
			});
		}

		const tmpWaves = [];
		const tmpResolved = new Set();
		const tmpRemaining = new Set(tmpAnnotatedSteps.map((pEntry) => { return pEntry.Index; }));

		while (tmpRemaining.size > 0)
		{
			const tmpWave = [];

			// Process steps in original order to find candidates for this wave
			for (const tmpIdx of tmpRemaining)
			{
				const tmpEntry = tmpAnnotatedSteps[tmpIdx];

				// Barrier steps always run alone in their own wave
				if (tmpEntry.IsBarrier)
				{
					if (tmpWave.length === 0)
					{
						tmpWave.push(tmpEntry);
					}
					// If we already have steps in this wave, the barrier starts the next wave
					break;
				}

				// If this wave already contains a barrier, stop adding
				if (tmpWave.length > 0 && tmpWave[0].IsBarrier)
				{
					break;
				}

				// Check if all dependencies are resolved
				let tmpDepsResolved = true;
				for (const tmpDep of tmpEntry.Dependencies)
				{
					// Check if any resolved destination is a prefix of (or equal to) this dependency
					let tmpFoundResolved = false;
					for (const tmpResolvedDest of tmpResolved)
					{
						if (tmpDep === tmpResolvedDest || tmpDep.startsWith(tmpResolvedDest + '.'))
						{
							tmpFoundResolved = true;
							break;
						}
					}
					if (tmpFoundResolved)
					{
						continue;
					}

					// Check if any unresolved step (remaining or current wave) produces this dependency.
					// If so, we cannot run this step yet.
					let tmpProducedByUnresolved = false;
					for (const tmpOtherIdx of tmpRemaining)
					{
						if (tmpOtherIdx === tmpEntry.Index)
						{
							continue;
						}
						const tmpOther = tmpAnnotatedSteps[tmpOtherIdx];
						if (tmpOther.Destination && (tmpDep === tmpOther.Destination || tmpDep.startsWith(tmpOther.Destination + '.')))
						{
							tmpProducedByUnresolved = true;
							break;
						}
					}
					// Also check steps already added to this wave
					if (!tmpProducedByUnresolved)
					{
						for (const tmpWaveEntry of tmpWave)
						{
							if (tmpWaveEntry.Destination && (tmpDep === tmpWaveEntry.Destination || tmpDep.startsWith(tmpWaveEntry.Destination + '.')))
							{
								tmpProducedByUnresolved = true;
								break;
							}
						}
					}
					if (tmpProducedByUnresolved)
					{
						tmpDepsResolved = false;
						break;
					}
					// Dependency refers to data not produced by any step (e.g. pre-seeded AppData);
					// treat as already available
				}

				if (!tmpDepsResolved)
				{
					continue;
				}

				// If this step forces sequential, it must be alone in its wave
				if (tmpEntry.ForceSequential)
				{
					if (tmpWave.length === 0)
					{
						tmpWave.push(tmpEntry);
						break;
					}
					// Otherwise skip it for now — it will be alone in a future wave
					continue;
				}

				tmpWave.push(tmpEntry);
			}

			// Safety valve: if we made no progress, force the next remaining step
			// to avoid an infinite loop (e.g. circular or unresolvable dependency)
			if (tmpWave.length === 0)
			{
				const tmpNextIdx = tmpRemaining.values().next().value;
				tmpWave.push(tmpAnnotatedSteps[tmpNextIdx]);
			}

			tmpWaves.push(tmpWave.map((pEntry) => { return { Index: pEntry.Index, Step: pEntry.Step }; }));

			for (const tmpEntry of tmpWave)
			{
				tmpRemaining.delete(tmpEntry.Index);
				if (tmpEntry.Destination)
				{
					tmpResolved.add(tmpEntry.Destination);
				}
			}
		}

		return tmpWaves;
	}

	gatherDataFromServer(pEntitiesBundleDescription, fCallback)
	{
		if (!Array.isArray(pEntitiesBundleDescription))
		{
			this.log.error(`EntityBundleRequest failed to parse entity bundle request because the input was not an array.`);
			return fCallback(new Error('EntityBundleRequest failed to parse entity bundle request because the input was not an array.'));
		}

		const tmpStateStack = [];
		let tmpState = {};

		// Build execution waves from the bundle description
		const tmpWaves = this.buildBundleWaves(pEntitiesBundleDescription);
		this.lastBundleWaves = tmpWaves;

		// The maximum number of concurrent requests per wave
		const tmpMaxConcurrency = (typeof this.options.maxBundleConcurrency === 'number') ? this.options.maxBundleConcurrency : 8;

		// Execute waves sequentially; steps within each wave run concurrently
		let tmpWaveIndex = 0;

		const fExecuteNextWave = () =>
		{
			if (tmpWaveIndex >= tmpWaves.length)
			{
				return fCallback();
			}

			const tmpWave = tmpWaves[tmpWaveIndex];
			tmpWaveIndex++;

			let tmpWaveAnticipate = this.fable.newAnticipate();
			tmpWaveAnticipate.maxOperations = Math.min(tmpWave.length, tmpMaxConcurrency);

			for (let w = 0; w < tmpWave.length; w++)
			{
				const tmpEntityBundleEntry = tmpWave[w].Step;
				tmpWaveAnticipate.anticipate(
					(fNext) =>
					{
						try
						{
							switch (tmpEntityBundleEntry.Type)
							{
								case 'SetStateAddress':
									tmpStateStack.push(tmpState);
									tmpState = this.fable.manifest.getValueByHash(this.fable, tmpEntityBundleEntry.StateAddress);
									if (typeof tmpState === 'undefined')
									{
										tmpState = {};
										this.fable.manifest.setValueByHash(this.fable, tmpEntityBundleEntry.StateAddress, tmpState);
									}
									return fNext();
								case 'PopState':
									if (tmpStateStack.length > 0)
									{
										tmpState = tmpStateStack.pop();
									}
									else
									{
										this.log.warn(`EntityBundleRequest encountered a PopState without a matching SetStateAddress.`);
									}
									return fNext();
								case 'Custom':
									return this.gatherCustomDataSet(tmpEntityBundleEntry, this.prepareState(tmpState, tmpEntityBundleEntry), fNext);
								case 'MapJoin':
									this.mapJoin(tmpEntityBundleEntry, this.prepareState(tmpState, tmpEntityBundleEntry));
									return fNext();
								case 'ProjectDataset':
									this.projectDataset(tmpEntityBundleEntry, this.prepareState(tmpState, tmpEntityBundleEntry));
									return fNext();
								// This is the default case, for a meadow entity set or single entity
								case 'MeadowEntityCount':
									return this.gatherEntitySetCount(tmpEntityBundleEntry, this.prepareState(tmpState, tmpEntityBundleEntry), fNext);
								case 'MeadowEntity':
								default:
									return this.gatherEntitySet(tmpEntityBundleEntry, this.prepareState(tmpState, tmpEntityBundleEntry), fNext);
							}
						}
						catch (pError)
						{
							this.log.error(`EntityBundleRequest error gathering entity set: ${pError}`, { Stack: pError.stack });
							return fNext();
						}
					});
			}

			tmpWaveAnticipate.wait(
				(pError) =>
				{
					if (pError)
					{
						this.log.error(`EntityBundleRequest error gathering entity set: ${pError}`, { Stack: pError.stack });
						return fCallback(pError);
					}
					return fExecuteNextWave();
				});
		};

		fExecuteNextWave();
	}

	/**
	 * Creates a wrapper state object to allow referencing common global state in addition to flow-state.
	 *
	 * @param {Record<string, any>} pState - The state object to prepare.
	 * @param {any} [pStepConfiguration] - (optional) The step configuration object provided in the config, if any.
	 * @return {Record<string, any>} - The prepared state object.
	 */
	prepareState(pState, pStepConfiguration)
	{
		return {
			State: pState,
			AppData: this.fable.AppData,
			Bundle: this.fable.Bundle,
			Pict: this.fable,
			Fable: this.fable,
			StepConfiguration: pStepConfiguration,
		};
	}

	/**
	 * @param {string} pEntity - The name of the entity to get.
	 * @param {string|number} pIDRecord - The ID of the record to get.
	 * @param {(pError?: Error, pRecord?: any) => void} fCallback - The callback function to call when the operation is complete.
	 */
	getEntity(pEntity, pIDRecord, fCallback, pScope = '')
	{
		this.initializeCache(pEntity, pScope);
		const tmpCacheKey = this._cacheKey(pEntity, pScope);
		// Discard anything from the cache that has expired or is over size.
		this.recordCache[tmpCacheKey].prune(
			function ()
			{
				let tmpPossibleRecord = this.recordCache[tmpCacheKey].read(pIDRecord);

				if (tmpPossibleRecord)
				{
					return fCallback(null, tmpPossibleRecord);
				}

				let tmpOptions = (
					{
						url: `${this.options.urlPrefix}${pEntity}/${pIDRecord}`
					});
				tmpOptions = this.prepareRequestOptions(tmpOptions);

				return this.restClient.getJSON(tmpOptions,
					(pError, pResponse, pBody) =>
					{
						/*
						 * FIXME: This breaks entity reads for nonexistent records. Putting this back for now until we can audit and fix all the places that may rely on this.
						if (pResponse && pResponse.statusCode && pResponse.statusCode >= 400)
						{
							this.log.error(`Error getting entity [${pEntity}] with ID [${pIDRecord}] from url [${tmpOptions.url}]: ${pResponse.statusCode} ${pResponse.statusMessage}`);
							return fCallback(new Error(`Error getting entity [${pEntity}] with ID [${pIDRecord}] from url [${tmpOptions.url}]: ${pResponse.statusCode} ${JSON.stringify(pBody || {})}`));
						}
						*/
						if (pBody)
						{
							this.recordCache[tmpCacheKey].put(pBody, pIDRecord);
						}
						return fCallback(pError, pBody);
					});
			}.bind(this));
	}

	/**
	 * For a given list of objects, cache connected entity records (use lazy loading of pages and not count requests).
	 *
	 * @param {Array} pRecordSet - An array of objects to check cache on joined records for, and, get/cache the records as needed.
	 * @param {Array} pIDListToCache - An array of property strings that are the ID fields to cache connected records for.
	 * @param {Array} pEntityListToCache - An array of entity names, which can override the speculative entity name derived from the ID field name.
	 * @param {boolean} pLiteRecords - If true, only cache lite records (ID and Name fields).
	 *
	 * @return {void}
	 */
	cacheConnectedEntityRecordsWithoutCount(pRecordSet, pIDListToCache, pEntityListToCache, pLiteRecords, fCallback, pScope = '')
	{
		//FIXME: pLiteRecords is ignored?
		if (!Array.isArray(pRecordSet) || pRecordSet.length < 1)
		{
			return fCallback();
		}

		if (!Array.isArray(pIDListToCache) || pIDListToCache.length < 1)
		{
			return fCallback();
		};

		const tmpAnticipate = this.fable.newAnticipate();

		const tmpEntityListToCache = pEntityListToCache || [];
		tmpAnticipate.maxOperations = 10;
		for (let i = 0; i < pIDListToCache.length; i++)
		{
			const tmpEntityIDSourceField = pIDListToCache[i];
			// If an entity name override is provided, use it, otherwise speculate the joined entity name ID field from the source ID field name.
			const tmpEntityName = tmpEntityListToCache[i] || tmpEntityIDSourceField.replace(/^ID/, '');
			const tmpIDField = `ID${tmpEntityName}`;

			// Make a set of IDs to fetch for this entity.
			const tmpEntityIDsToFetch = new Set();

			// Initialize the cache
			this.initializeCache(tmpEntityName, pScope);
			const tmpCacheKey = this._cacheKey(tmpEntityName, pScope);
			// Prune expired entries BEFORE reading: read() does not check TTL, so an
			// expired-but-unpruned entry reads as a hit and we'd wrongly skip the batch
			// fetch, only for the per-row getEntity (which prunes first) to miss and
			// fetch each one individually. prune is synchronous.
			this.recordCache[tmpCacheKey].prune(() => {});

			// First pass: gather IDs to fetch
			for (const tmpRecord of pRecordSet)
			{
				const tmpIDValue = tmpRecord[tmpEntityIDSourceField];
				if (tmpIDValue)
				{
					const tmpCachedRecord = this.recordCache[tmpCacheKey].read(tmpIDValue);
					if (!tmpCachedRecord)
					{
						tmpEntityIDsToFetch.add(tmpIDValue);
					}
				}
			}

			// Now if there are records to fetch, do the request.
			if (tmpEntityIDsToFetch.size > 0)
			{
				tmpAnticipate.anticipate(
					function (fRequestComplete)
					{
						const tmpIDRecordsArray = Array.from(tmpEntityIDsToFetch);
						this.getEntitySetByIDListChunked(tmpEntityName, tmpIDRecordsArray, { NoCount: true, Scope: pScope }, fRequestComplete);
					}.bind(this));
			}
		}

		tmpAnticipate.wait(
			(pError) =>
			{
				if (pError)
				{
					this.log.error(`cacheConnectedEntityRecords error gathering connected entity records: ${pError}`, { Stack: pError.stack });
					return fCallback(pError);
				}
				return fCallback();
			});
	}

	/**
	 * Fetch a set of entity records by primary-key ID list, chunking the meadow IN
	 * filter into requests.
	 *
	 * Chunk size is capability-aware: the legacy GET read embeds the IN-list in
	 * the URL, so it is chunked small (ConnectedEntityIDChunkSize, default 200) to
	 * keep the URL under HTTP/2 header-size limits — oversized URLs trip a
	 * connection-level reset that takes sibling multiplexed requests down with it.
	 * When the endpoint serves POST /:Entity/Query the IN-list rides in the body
	 * (no URI limit), so a much larger chunk is used (ConnectedEntityIDQueryChunkSize,
	 * default 5000) — bounding response size rather than URL length, and collapsing
	 * what used to be many small requests into one (or a few). Records are cached
	 * as a side effect of getEntitySet; the callback returns no data.
	 *
	 * @param {string} pEntityName - The entity name (e.g. 'Project').
	 * @param {Array<number|string>} pIDRecordsArray - The primary-key IDs to fetch.
	 * @param {Object} pOptions - Options passed through to getEntitySet (Scope, NoCount, URLPrefix, etc).
	 * @param {(error?: Error) => void} fCallback - Completion callback.
	 *
	 * @return {void}
	 */
	getEntitySetByIDListChunked(pEntityName, pIDRecordsArray, pOptions, fCallback)
	{
		if (!Array.isArray(pIDRecordsArray) || pIDRecordsArray.length < 1)
		{
			return fCallback();
		}

		const tmpOptions = pOptions || {};

		// Resolve transport capability once (cached; getEntitySet reuses it) so the
		// chunk size matches the transport. The probe URL prefix matches the one
		// getEntitySet will read from tmpOptions.URLPrefix.
		this.resolveEntityQuerySupport(pEntityName, tmpOptions.URLPrefix,
			(pSupportError, pSupportsQuery) =>
			{
				const tmpChunkSize = pSupportsQuery
					? ((this.options && this.options.ConnectedEntityIDQueryChunkSize) || 5000)
					: ((this.options && this.options.ConnectedEntityIDChunkSize) || 200);

				const tmpAnticipate = this.fable.newAnticipate();

				for (let i = 0; i < pIDRecordsArray.length; i += tmpChunkSize)
				{
					const tmpIDChunk = pIDRecordsArray.slice(i, i + tmpChunkSize);
					tmpAnticipate.anticipate(
						function (fChunkComplete)
						{
							const tmpMeadowFilterExpression = `FBL~ID${pEntityName}~INN~${tmpIDChunk.join(',')}`;
							this.getEntitySet(pEntityName, tmpMeadowFilterExpression,
								(pError) =>
								{
									if (pError)
									{
										this.log.error(`getEntitySetByIDListChunked error getting connected entity records for [${pEntityName}] with IDs [${tmpIDChunk.join(',')}]: ${pError}`, { Stack: pError.stack });
										return fChunkComplete(pError);
									}
									return fChunkComplete();
								}, null, tmpOptions);
						}.bind(this));
				}

				tmpAnticipate.wait(fCallback);
			});
	}

	/**
	 * For a given list of objects, cache connected entity records.
	 *
	 * @param {Array} pRecordSet - An array of objects to check cache on joined records for, and, get/cache the records as needed.
	 * @param {Array} pIDListToCache - An array of property strings that are the ID fields to cache connected records for.
	 * @param {Array} pEntityListToCache - An array of entity names, which can override the speculative entity name derived from the ID field name.
	 * @param {boolean} pLiteRecords - If true, only cache lite records (ID and Name fields).
	 *
	 * @return {void}
	 */
	cacheConnectedEntityRecords(pRecordSet, pIDListToCache, pEntityListToCache, pLiteRecords, fCallback, pScope = '')
	{
		//FIXME: pLiteRecords is ignored?
		if (!Array.isArray(pRecordSet) || pRecordSet.length < 1)
		{
			return fCallback();
		}

		if (!Array.isArray(pIDListToCache) || pIDListToCache.length < 1)
		{
			return fCallback();
		};

		const tmpAnticipate = this.fable.newAnticipate();

		const tmpEntityListToCache = pEntityListToCache || [];

		for (let i = 0; i < pIDListToCache.length; i++)
		{
			const tmpEntityIDSourceField = pIDListToCache[i];
			// If an entity name override is provided, use it, otherwise speculate the joined entity name ID field from the source ID field name.
			const tmpEntityName = tmpEntityListToCache[i] || tmpEntityIDSourceField.replace(/^ID/, '');
			const tmpIDField = `ID${tmpEntityName}`;

			// Make a set of IDs to fetch for this entity.
			const tmpEntityIDsToFetch = new Set();

			// Initialize the cache
			this.initializeCache(tmpEntityName, pScope);
			const tmpCacheKey = this._cacheKey(tmpEntityName, pScope);
			// Prune expired entries BEFORE reading: read() does not check TTL, so an
			// expired-but-unpruned entry reads as a hit and we'd wrongly skip the batch
			// fetch, only for the per-row getEntity (which prunes first) to miss and
			// fetch each one individually. prune is synchronous.
			this.recordCache[tmpCacheKey].prune(() => {});

			// First pass: gather IDs to fetch
			for (const tmpRecord of pRecordSet)
			{
				const tmpIDValue = tmpRecord[tmpEntityIDSourceField];
				if (tmpIDValue)
				{
					const tmpCachedRecord = this.recordCache[tmpCacheKey].read(tmpIDValue);
					if (!tmpCachedRecord)
					{
						tmpEntityIDsToFetch.add(tmpIDValue);
					}
				}
			}

			// Now if there are records to fetch, do the request.
			if (tmpEntityIDsToFetch.size > 0)
			{
				tmpAnticipate.anticipate(
					function (fRequestComplete)
					{
						const tmpIDRecordsArray = Array.from(tmpEntityIDsToFetch);
						this.getEntitySetByIDListChunked(tmpEntityName, tmpIDRecordsArray, { Scope: pScope }, fRequestComplete);
					}.bind(this));
			}
		}

		tmpAnticipate.wait(
			(pError) =>
			{
				if (pError)
				{
					this.log.error(`cacheConnectedEntityRecords error gathering connected entity records: ${pError}`, { Stack: pError.stack });
					return fCallback(pError);
				}
				return fCallback();
			});
	}

	/**
	 * Cache an array of records, likely from a meadow endpoint
	 *
	 * @param {string} pEntity - The entity type to cache individual records for
	 * @param {Array<Record<string, any>>} pRecordSet - An array of records to cache
	 */
	cacheIndividualEntityRecords(pEntity, pRecordSet, pScope = '')
	{
		this.initializeCache(pEntity, pScope);
		const tmpCacheKey = this._cacheKey(pEntity, pScope);

		const tmpEntitySet = pRecordSet;

		if (Array.isArray(tmpEntitySet) && tmpEntitySet.length > 0)
		{
			// Cache each record individually.
			// This code is here because the downstream getEntitySet function uses this to load records, so both are covered here.
			const tmpSpeculativeRecordIDColumn = `ID${pEntity}`;
			if (tmpEntitySet[0] && typeof tmpEntitySet[0] === 'object' && tmpSpeculativeRecordIDColumn in tmpEntitySet[0])
			{
				for (let i = 0; i < tmpEntitySet.length; i++)
				{
					const tmpRecord = tmpEntitySet[i];
					const tmpIDRecord = tmpRecord[tmpSpeculativeRecordIDColumn];
					if (tmpIDRecord)
					{
						this.recordCache[tmpCacheKey].put(tmpRecord, tmpIDRecord);
					}
				}
			}
		}
	}

	/**
	 * @param {string} pEntity - The name of the entity to get.
	 * @param {string} pMeadowFilterExpression - The meadow filter expression to filter the entity set by.
	 * @param {number} pRecordStartCursor - The starting cursor for record pagination.
	 * @param {number} pRecordCount - The number of records to return for pagination.
	 * @param {(pError?: Error, pEntitySet?: Array<Record<string, any>>) => void} fCallback - The callback function to call when the operation is complete.
	 * @param {string} [postfix] - Optional, adds a postfix string to the url.
	 * @param {string} [pURLPrefix] - Optional per-request URL prefix; overrides the provider default (e.g. a private-data-lake route).
	 * @param {Record<string, any>} [pOptions] - Optional { Scope, Projection }: cache scope and Lite/LiteExtended projection.
	 */
	getEntitySetPage(pEntity, pMeadowFilterExpression, pRecordStartCursor, pRecordCount, fCallback, postfix = '', pURLPrefix = '', pOptions = {})
	{
		const tmpScope = (pOptions && pOptions.Scope) ? pOptions.Scope : '';
		// Per-request URL prefix override (positional, e.g. a private-data-lake route);
		// also accepted via pOptions.URLPrefix. Falls back to the provider default.
		const tmpURLPrefix = pURLPrefix || (pOptions && pOptions.URLPrefix) || this.options.urlPrefix;
		// LiteExtended projection: fetch only ID/GUID/owner/update + the requested
		// ExtraColumns (drops blob columns). Used by scoped list fetches to avoid the
		// heavy full-record payload.
		const tmpProjection = (pOptions && pOptions.Projection) ? pOptions.Projection : null;

		this.resolveEntityQuerySupport(pEntity, tmpURLPrefix,
			(pSupportError, pSupportsQuery) =>
			{
				this._readEntityPage(pEntity, pMeadowFilterExpression, pRecordStartCursor, pRecordCount,
					{ SupportsQuery: pSupportsQuery, URLPrefix: tmpURLPrefix, Postfix: postfix || '', Projection: tmpProjection },
					(pDownloadError, pDownloadResponse, pDownloadBody) =>
					{
						if (pDownloadResponse && pDownloadResponse.statusCode && pDownloadResponse.statusCode >= 400)
						{
							this.log.error(`Error getting entity set of [${pEntity}] filtered to [${pMeadowFilterExpression}] [${pRecordStartCursor}/${pRecordCount}]: ${pDownloadResponse.statusCode} ${pDownloadResponse.statusMessage}`);
							return fCallback(new Error(`Error getting entity set of [${pEntity}] filtered to [${pMeadowFilterExpression}] [${pRecordStartCursor}/${pRecordCount}]: ${pDownloadResponse.statusCode} ${JSON.stringify(pDownloadBody || {})}`));
						}

						// Do not cache projected (Lite/partial) records in the entity cache — a
						// partial record would shadow the full record for other consumers
						// (row-click View, {~E:~}). Projected fetches are rendered straight from
						// the list state and never need to be in the entity cache.
						if (!tmpProjection)
						{
							this.cacheIndividualEntityRecords(pEntity, pDownloadBody, tmpScope);
						}

						return fCallback(pDownloadError, pDownloadBody);
					});
			});
	}

	/**
	 * @param {string} pEntity - The name of the entity to get the count of.
	 * @param {string} pMeadowFilterExpression - The meadow filter expression to filter the entity set by.
	 * @param {(pError?: Error, pRecordCount?: number) => void} fCallback - The callback function to call when the operation is complete.
	 * @param {string} [postfix] - Optional, adds a postfix string to the count url
	 * @param {string} [pURLPrefix] - Optional per-request URL prefix; overrides the provider default.
	 */
	getEntitySetRecordCount(pEntity, pMeadowFilterExpression, fCallback, postfix = '', pURLPrefix = '')
	{
		this.resolveEntityQuerySupport(pEntity, pURLPrefix,
			(pSupportError, pSupportsQuery) =>
			{
				this._readEntityCount(pEntity, pMeadowFilterExpression,
					{ SupportsQuery: pSupportsQuery, URLPrefix: pURLPrefix || '', Postfix: postfix || '' },
					(pError, pResponse, pBody) =>
					{
						if (pResponse && pResponse.statusCode && pResponse.statusCode >= 400)
						{
							this.log.error(`Error getting entity count of [${pEntity}] filtered to [${pMeadowFilterExpression}]: ${pResponse.statusCode} ${pResponse.statusMessage}`);
							return fCallback(new Error(`Error getting entity count of [${pEntity}] filtered to [${pMeadowFilterExpression}]: ${pResponse.statusCode} ${JSON.stringify(pBody || {})}`));
						}
						if (pError)
						{
							this.log.error(`Error getting entity count of [${pEntity}] filtered to [${pMeadowFilterExpression}]: ${pError}`);
							return fCallback(pError);
						}
						let tmpRecordCount = 0;
						if (pBody && pBody.Count)
						{
							tmpRecordCount = pBody.Count;
						}
						return fCallback(pError, tmpRecordCount);
					});
			});
	}

	/**
	 * @param {string} pEntity - The name of the entity to get.
	 * @param {string} pMeadowFilterExpression - The meadow filter expression to filter the entity set by.
	 * @param {(pError?: Error, pEntitySet?: Array<Record<string, any>>) => void} fCallback - The callback function to call when the operation is complete.
	 */
	getEntitySetWithAutoCaching(pEntity, pMeadowFilterExpression, fCallback)
	{
		let tmpAnticipate = this.fable.newAnticipate();

		let tmpRequestState = {Entity: pEntity, MeadowFilterExpression: pMeadowFilterExpression, EntitySet: null};

		tmpAnticipate.anticipate(
			function(fNext)
			{
				this.getEntitySet(pEntity, pMeadowFilterExpression,
					(pError, pEntitySet) =>
					{
						if (pError)
						{
							this.log.error(`getEntitySetWithAutoCaching error getting entity set for [${pEntity}] filtered to [${pMeadowFilterExpression}]: ${pError}`, { Stack: pError.stack });
							return fNext(pError);
						}
						tmpRequestState.EntitySet = pEntitySet;
						return fNext();
					});
			}.bind(this));

		tmpAnticipate.anticipate(
			function(fNext)
			{
				// Now see if we can infer some entities from this set to cache individual records for.
				if ((typeof(tmpRequestState.EntitySet) == 'object') && Array.isArray(tmpRequestState.EntitySet) && (tmpRequestState.EntitySet.length > 0))
				{
					// Look at each column and if it starts with `ID` and is longer than `ID` then speculate it is an entity join.
					const tmpFirstRecord = tmpRequestState.EntitySet[0];
					const tmpIDColumnsToCache = [];
					const tmpEntityNamesToCache = [];
					for (const tmpColumnName of Object.keys(tmpFirstRecord))
					{
						if ((tmpColumnName.startsWith('ID')) && (tmpColumnName.length > 2))
						{
							// Speculate this is an entity join.
							tmpIDColumnsToCache.push(tmpColumnName);
							const tmpSpeculatedEntityName = tmpColumnName.substring(2);
							tmpEntityNamesToCache.push(tmpSpeculatedEntityName);
						}
						// Mutate any `CreatingIDUser`, `UpdatingIDUser`, `DeletingIDUser` to the proper entiity
						else if (tmpColumnName in this.entityColumnTranslations)
						{
							tmpIDColumnsToCache.push(tmpColumnName);
							tmpEntityNamesToCache.push(this.entityColumnTranslations[tmpColumnName]);
						}
					}

					if (tmpIDColumnsToCache.length > 0)
					{
						return this.cacheConnectedEntityRecords(
							tmpRequestState.EntitySet,
							tmpIDColumnsToCache,
							tmpEntityNamesToCache,
							false,
							(pError) =>
							{
								if (pError)
								{
									this.log.error(`getEntitySetWithAutoCaching error caching connected entity records for [${pEntity}] filtered to [${pMeadowFilterExpression}]: ${pError}`, { Stack: pError.stack });
									return fNext(pError);
								}
								return fNext();
							});
					}
					else
					{
						return fNext();
					}
				}
				else
				{
					return fNext();
				}
			}.bind(this));

		tmpAnticipate.wait(
			function (pError)
			{
				if (pError)
				{
					this.log.error(`getEntitySetWithAutoCaching error gathering entity set for [${pEntity}] filtered to [${pMeadowFilterExpression}]: ${pError}`, { Stack: pError.stack });
					return fCallback(pError);
				}
				return fCallback(null, tmpRequestState.EntitySet);
			}.bind(this));
	}

	/**
	 * @param {string} pEntity - The entity to get a set of.
	 * @param {string} pMeadowFilterExpression - The meadow filter expression to filter the entity set by.
	 * @param {(pError?: Error, pEntitySet?: Array) => void} fCallback - The callback to call when the request is complete.
	 * @param {string} [postfix] - Optional, adds a postfix string to all calls made.
	 * @param {Record<string, any>} [pOptions] - Optional, per-call options (e.g. { DownloadPageConcurrency: 1 }).
	 *
	 * @return {void}
	 */
	getEntitySet(pEntity, pMeadowFilterExpression, fCallback, postfix = '', pOptions = {})
	{
		const tmpURLPrefix = pOptions.URLPrefix || this.options.urlPrefix;
		const tmpScope = (pOptions && pOptions.Scope) ? pOptions.Scope : '';
		this.initializeCache(pEntity, tmpScope);
		const tmpCacheKey = this._cacheKey(pEntity, tmpScope);

		// Resolve transport capability once for the whole read (count + every
		// page share the same SupportsQuery flag). The legacy GET reads embed the
		// filter (and any large IN-list) in the URI, which is exactly the long-URI
		// failure POST /:Entity/Query avoids when the server supports it.
		this.resolveEntityQuerySupport(pEntity, tmpURLPrefix,
			(pSupportError, pSupportsQuery) =>
			{
				const tmpReadOptions = { SupportsQuery: pSupportsQuery, URLPrefix: tmpURLPrefix, Postfix: postfix || '' };

				// Discard anything from the cache that has expired or is over size.
				this.recordSetCache[tmpCacheKey].prune(
					function ()
					{
						let tmpPossibleRecords = this.recordSetCache[tmpCacheKey].read(pMeadowFilterExpression);

						if (tmpPossibleRecords)
						{
							return fCallback(null, tmpPossibleRecords);
						}
						if (pOptions.NoCount)
						{
							// Lazily load until we hit a not full page rather than using couns.
							// Does not respect parallelization.
							const pageSize = 250;
							let page = 0;
							let returnSet = [];
							const recursiveCallback = (pDownloadError, pDownloadResponse, pDownloadBody) =>
							{
								// A transport-level failure (e.g. connection reset, expired TLS
								// cert) calls back with no response, so guard every pDownloadResponse
								// deref and surface the underlying error rather than throwing a
								// TypeError on the missing statusCode.
								if (pDownloadError || (pDownloadResponse && pDownloadResponse.statusCode && pDownloadResponse.statusCode >= 400) || !Array.isArray(pDownloadBody))
								{
									const tmpStatusCode = pDownloadResponse ? pDownloadResponse.statusCode : 'no response';
									const tmpStatusDetail = pDownloadError ? (pDownloadError.message || pDownloadError) : (pDownloadResponse ? pDownloadResponse.statusMessage : '');
									this.log.error(`Error getting entity set of [${pEntity}] filtered to [${pMeadowFilterExpression}]: ${tmpStatusCode} ${tmpStatusDetail}`);
									return fCallback(pDownloadError || new Error(`Error getting entity set of [${pEntity}] filtered to [${pMeadowFilterExpression}]: ${tmpStatusCode} ${JSON.stringify(pDownloadBody || {})}`), []);
								}

								returnSet = returnSet.concat(pDownloadBody);

								if (pDownloadBody?.length < pageSize)
								{
									this.recordSetCache[tmpCacheKey].put(returnSet, pMeadowFilterExpression);

									this.cacheIndividualEntityRecords(pEntity, returnSet, tmpScope);
									fCallback(null, returnSet);
								}
								else
								{
									page += 1;
									this._readEntityPage(pEntity, pMeadowFilterExpression, page * pageSize, pageSize, tmpReadOptions, recursiveCallback);
								}
							};
							return this._readEntityPage(pEntity, pMeadowFilterExpression, page * pageSize, pageSize, tmpReadOptions, recursiveCallback);
						}
						return this.getEntitySetRecordCount(pEntity, pMeadowFilterExpression,
							(pRecordCountError, pRecordCount) =>
							{
								if (pRecordCountError)
								{
									return fCallback(pRecordCountError);
								}
								let tmpRecordCount = pRecordCount;

								if (isNaN(pRecordCount))
								{
									this.log.error(`Entity count did not return a number for [${pEntity}] filtered to [${pMeadowFilterExpression}]... something is fatally wrong from the server accessed in getEntitySet call.`);
									return fCallback(new Error('Entity count did not return a number in getEntitySet.'));
								}

								let tmpDownloadBatchSize = this.options.downloadBatchSize;
								const tmpPageCount = Math.ceil(tmpRecordCount / tmpDownloadBatchSize);

								// Build an indexed array of page descriptors to preserve ordering
								const tmpPages = [];
								for (let i = 0; i < tmpPageCount; i++)
								{
									tmpPages.push({
										Index: i,
										Begin: i * tmpDownloadBatchSize,
										Records: null
									});
								}

								// Fetch pages concurrently and reassemble in order.
								// Per-call DownloadPageConcurrency overrides the provider-level default.
								const tmpPageConcurrency = (typeof pOptions.DownloadPageConcurrency === 'number')
									? pOptions.DownloadPageConcurrency
									: ((typeof this.options.downloadPageConcurrency === 'number') ? this.options.downloadPageConcurrency : 4);
								this.fable.Utility.eachLimit(tmpPages, tmpPageConcurrency,
									(pPage, fDownloadCallback) =>
									{
										this._readEntityPage(pEntity, pMeadowFilterExpression, pPage.Begin, tmpDownloadBatchSize, tmpReadOptions,
											(pDownloadError, pDownloadResponse, pDownloadBody) =>
											{
												if (pDownloadResponse && pDownloadResponse.statusCode && pDownloadResponse.statusCode >= 400)
												{
													this.log.error(`Error getting entity set of [${pEntity}] filtered to [${pMeadowFilterExpression}] [${pPage.Begin}/${tmpDownloadBatchSize}]: ${pDownloadResponse.statusCode} ${pDownloadResponse.statusMessage}`);
													return fDownloadCallback(new Error(`Error getting entity set of [${pEntity}] filtered to [${pMeadowFilterExpression}] [${pPage.Begin}/${tmpDownloadBatchSize}]: ${pDownloadResponse.statusCode} ${JSON.stringify(pDownloadBody || {})}`));
												}
												if (Array.isArray(pDownloadBody))
												{
													pPage.Records = pDownloadBody;
												}
												return fDownloadCallback(pDownloadError);
											});
									},
									(pFullDownloadError) =>
									{
										// Reassemble pages in index order to maintain consistent ordering
										let tmpEntitySet = [];
										for (let i = 0; i < tmpPages.length; i++)
										{
											if (Array.isArray(tmpPages[i].Records))
											{
												tmpEntitySet = tmpEntitySet.concat(tmpPages[i].Records);
											}
										}

										if (tmpEntitySet)
										{
											this.recordSetCache[tmpCacheKey].put(tmpEntitySet, pMeadowFilterExpression);
										}

										this.cacheIndividualEntityRecords(pEntity, tmpEntitySet, tmpScope);

										return fCallback(pFullDownloadError, tmpEntitySet);
									})
							}, postfix, pOptions.URLPrefix);
					}.bind(this));
			});
	}

	////////////////////////////////////////////////////////////////////////////////
	// Entity Creation and Update Methods
	/**
	 * @param {string} pEntityType - The type of the entity to format the URL for.
	 *
	 * @return {string} - The formatted URL for the given entity type.
	 */
	formatUrl(pEntityType)
	{
		return `${this.options.urlPrefix}${pEntityType}`;
	}


	/**
	 * Create a new entity record.
	 *
	 * @param {string} pEntityType - The entity type to create.
	 * @param {Record<string, any>} pRecord - The record to create.
	 * @param {(pError?: Error, pResult?: Record<string, any>) => void} fCallback - The callback to call when the request is complete.
	 *
	 * @return {void}
	 */
	createEntity(pEntityType, pRecord, fCallback)
	{
		let tmpRequestOptions = (
			{
				url: this.formatUrl(pEntityType),
				body: pRecord
			});

		this.restClient.postJSON(tmpRequestOptions,
			(pError, pResponse, pBody) =>
			{
				if (pError)
				{
					this.log.error(`Error creating ${pEntityType} record: ${pError.message}`);
				}
				else
				{
					this.log.info(`Created ${pEntityType} record ID ${pBody[`ID${pEntityType}`]}`);
				}
				return fCallback(pError, pBody);
			});
	}

	/**
	 * Update an entity record.
	 *
	 * @param {string} pEntityType - The entity type to create.
	 * @param {Record<string, any>} pRecord - The record to create.
	 * @param {(pError?: Error, pResult?: Record<string, any>) => void} fCallback - The callback to call when the request is complete.
	 *
	 * @return {void}
	 */
	updateEntity(pEntityType, pRecord, fCallback)
	{
		let tmpRequestOptions = (
			{
				url: this.formatUrl(pEntityType),
				body: pRecord
			});

		this.restClient.putJSON(tmpRequestOptions,
			(pError, pResponse, pBody) =>
			{
				if (pError)
				{
					this.log.error(`Error updating ${pEntityType} record: ${pError.message}`);
				}
				else
				{
					this.log.info(`Updated ${pEntityType} record ID ${pBody[`ID${pEntityType}`]}`);
				}
				return fCallback(pError, pBody);
			});
	}

	/**
	 * Upsert an entity record.
	 *
	 * @param {String} pEntityType - The entity type to be upserted.
	 * @param {Object<String, any>} pRecord - The record to upsert.
	 * @param {(pError?: Error, pResult?: any) => void} fCallback - The callback to call when the request is complete.
	 *
	 * @return {void}
	 */
	upsertEntity(pEntityType, pRecord, fCallback)
	{
		let tmpRequestOptions = (
			{
				url: this.formatUrl(`${pEntityType}/Upsert`),
				body: pRecord
			});

		this.restClient.putJSON(tmpRequestOptions,
			(pError, pResponse, pBody) =>
			{
				if (pError)
				{
					this.log.error(`Error upserting ${pEntityType} record: ${pError.message}`);
				}
				else
				{
					this.log.info(`Upserted ${pEntityType} record ID ${pBody[`ID${pEntityType}`]}`);
				}
				return fCallback(pError, pBody);
			});
	}

	/**
	 * Upsert a array of entity records.
	 *
	 * @param {string} pEntityType - The entity type to be upserted.
	 * @param {Array<Record<string, any>>} pRecords - The records to upsert.
	 * @param {(pError?: Error, pResults?: Array<any>) => void} fCallback - The callback to call when the request is complete.
	 *
	 * @return {void}
	 */
	upsertEntities(pEntityType, pRecords, fCallback)
	{
		let tmpRequestOptions = (
			{
				url: this.formatUrl(`${pEntityType}/Upserts`),
				body: pRecords
			});

		this.restClient.putJSON(tmpRequestOptions,
			(pError, pResponse, pBody) =>
			{
				if (pError)
				{
					this.log.error(`Error upserting ${pEntityType} records: ${pError.message}`);
				}
				else
				{
					this.log.info(`Upserted multiple ${pEntityType} records (count: ${pBody.length})`);
				}
				return fCallback(pError, pBody);
			});
	}

	/**
	 * Delete an entity record.
	 *
	 * @param {string} pEntityType - The entity type to create.
	 * @param {string | Number} pIDRecord - The ID of the record to delete.
	 * @param {(pError?: Error, pResult?: Record<string, any>) => void} fCallback - The callback to call when the request is complete.
	 *
	 * @return {void}
	 */
	deleteEntity(pEntityType, pIDRecord, fCallback)
	{
		let tmpRequestOptions = (
			{
				url: this.formatUrl(`${pEntityType}/${pIDRecord}`),
			});

		this.restClient.delJSON(tmpRequestOptions,
			(pError, pResponse, pBody) =>
			{
				if (pError)
				{
					this.log.error(`Error deleting ${pEntityType} record ID ${pIDRecord}: ${pError.message}`);
				}
				else
				{
					this.log.info(`Deleted ${pEntityType} record ID ${pIDRecord}`);
				}
				return fCallback(pError, pBody);
			});
	}
}

module.exports = PictMeadowEntityProvider;
