export = PictMeadowEntityProvider;
declare class PictMeadowEntityProvider {
    constructor(pFable: any, pOptions: any, pServiceHash: any);
    /** @type {any} */
    options: any;
    /** @type {import('./Pict') & { settings: any } & { newAnticipate: any }} */
    fable: import("./Pict") & {
        settings: any;
    } & {
        newAnticipate: any;
    };
    /** @type {any} */
    log: any;
    serviceType: string;
    restClient: any;
    /** @type {Record<string, import('cachetrax')>} */
    recordCache: Record<string, any>;
    /** @type {Record<string, import('cachetrax')>} */
    recordSetCache: Record<string, any>;
    entityColumnTranslations: {
        CreatingIDUser: string;
        UpdatingIDUser: string;
        DeletingIDUser: string;
    };
    /** @type {(pOptions: Record<string, any>) => Record<string, any>} */
    prepareRequestOptions: (pOptions: Record<string, any>) => Record<string, any>;
    /**
     * After buildBundleWaves() is called by gatherDataFromServer(), this
     * property holds the computed wave schedule for inspection/debugging.
     * @type {Array<Array<{Index: number, Step: Record<string, any>}>>|null}
     */
    lastBundleWaves: Array<Array<{
        Index: number;
        Step: Record<string, any>;
    }>> | null;
    useQueryEndpoint: any;
    /**
     * Per-(urlPrefix, entity) capability cache. Different entities can resolve
     * to different backend services (and thus different meadow-endpoints
     * versions) behind the same urlPrefix, so support is cached per entity.
     * @type {Record<string, { SupportsQuery: boolean, Metadata: (Record<string, any>|null) }>}
     */
    endpointCapabilityCache: Record<string, {
        SupportsQuery: boolean;
        Metadata: (Record<string, any> | null);
    }>;
    /**
     * In-flight capability probes, keyed identically to the cache, so
     * concurrent reads of the same entity collapse onto a single Schema probe.
     * @type {Record<string, Array<(pError: Error|null, pSupportsQuery: boolean) => void>>}
     */
    endpointCapabilityInflight: Record<string, Array<(pError: Error | null, pSupportsQuery: boolean) => void>>;
    /**
     * Compute the capability cache key for an (entity, urlPrefix) pair.
     *
     * @param {string} pEntity - The entity name.
     * @param {string} [pURLPrefix] - The URL prefix in play (defaults to the provider default).
     * @return {string} The cache key.
     */
    _capabilityKey(pEntity: string, pURLPrefix?: string): string;
    /**
     * Major-version-aware check of whether a meadow-endpoints version string
     * serves the POST /:Entity/Query route. Support is keyed off the major
     * version (see QUERY_ENDPOINT_MIN_VERSION_BY_MAJOR) because the route was
     * backported to 2.1.0 and added in 4.1.0, but absent on 3.x and 4.0.x.
     *
     * @param {string} pVersion - A semver string (e.g. '4.1.0').
     * @return {boolean} True if the version is known to serve the Query route.
     */
    isMeadowEndpointsVersionQueryCapable(pVersion: string): boolean;
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
    evaluateQueryEndpointSupport(pSchemaBody: Record<string, any>): boolean;
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
    primeEntityCapabilityFromSchema(pEntity: string, pSchemaBody: Record<string, any>, pURLPrefix?: string): boolean;
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
    resolveEntityQuerySupport(pEntity: string, pURLPrefix: string, fCallback: (pError: Error | null, pSupportsQuery: boolean) => void): void;
    /**
     * Build the POST /:Entity/Query request body for a filtered read.
     *
     * @param {string} pMeadowFilterExpression - The meadow filter string (may be empty).
     * @param {number|null} [pBegin] - Pagination start cursor.
     * @param {number|null} [pCap] - Pagination page size.
     * @param {Record<string, any>} [pProjection] - Optional { Mode:'LiteExtended', ExtraColumns:[...] }.
     * @return {Record<string, any>} The request body envelope.
     */
    _buildQueryReadBody(pMeadowFilterExpression: string, pBegin?: number | null, pCap?: number | null, pProjection?: Record<string, any>): Record<string, any>;
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
    _readEntityPage(pEntity: string, pMeadowFilterExpression: string, pBegin: number | null, pCap: number | null, pReadOptions: Record<string, any>, fCallback: (pError: Error | null, pResponse: any, pBody: any) => void): void;
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
    _readEntityCount(pEntity: string, pMeadowFilterExpression: string, pReadOptions: Record<string, any>, fCallback: (pError: Error | null, pResponse: any, pBody: any) => void): void;
    /**
     * Compute the cache bucket key for an entity, optionally namespaced by a scope.
     * A non-empty scope yields an isolated bucket (`Entity::Scope`) so scoped/partial
     * (e.g. Lite) records never touch the global `Entity` cache that full-record
     * consumers ({~E:~}, read views, pickers) rely on. Empty scope === today's key.
     * @param {string} pEntity - The entity name.
     * @param {string} [pScope] - Optional cache scope.
     * @return {string} The cache bucket key.
     */
    _cacheKey(pEntity: string, pScope?: string): string;
    /**
     * @param {string} pEntity - The name of the entity to initialize the cache for
     * @param {string} [pScope] - Optional cache scope to namespace the bucket.
     */
    initializeCache(pEntity: string, pScope?: string): void;
    /**
     * Clear every cache bucket (record + record-set + Bundle map) belonging to a
     * scope. Recordset lists call this at the start of each load (fresh prefetch,
     * no stale list data) and on CRUD invalidation.
     * @param {string} pScope - The cache scope to clear.
     */
    clearScope(pScope: string): void;
    /**
     * @param {object} pEntityInformation - The entity information object.
     * @param {object} pContext - The context object to use when parsing the filter template and assigning the results to the destination.
     * @param {() => void} fCallback - The callback function to call when the operation is complete, which should take an optional error as its first parameter.
     */
    gatherEntitySetCount(pEntityInformation: object, pContext: object, fCallback: () => void): void;
    /**
     * @param {Record<string, any>} pEntityInformation - The entity information object.
     * @param {Record<string, any>} pContext - The context object to use when parsing the filter template and assigning the results to the destination.
     * @param {(pError?: Error) => void} fCallback - The callback function to call when the operation is complete, which should take an optional error as its first parameter and the record set or count as its second parameter.
     */
    gatherEntitySet(pEntityInformation: Record<string, any>, pContext: Record<string, any>, fCallback: (pError?: Error) => void): void;
    /**
     * @param {Record<string, any>} pDestinationEntity - The destination entity to map the join results to.
     * @param {Record<string, any>} pCustomRequestInformation - The custom request information object.
     * @param {Record<string, any>} pContext - The context object to use when parsing templates and resolving addresses.
     */
    mapJoinSingleDestination(pDestinationEntity: Record<string, any>, pCustomRequestInformation: Record<string, any>, pContext: Record<string, any>): Record<string, any>[];
    /**
     * @param {Record<string, any>} pCustomRequestInformation - The custom request information object.
     * @param {Record<string, any>} pContext - The context object to use when parsing templates and resolving addresses.
     */
    mapJoin(pCustomRequestInformation: Record<string, any>, pContext: Record<string, any>): any;
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
    projectDataset(pConfiguration: Record<string, any>, pContext: Record<string, any>): void;
    /**
     * @param {Record<string, any>} pConfiguration - The configuration object for the dataset projection.
     * @param {Record<string, any>} pContext - The context object to use when resolving the output recordset address mapping.
     * @param {Record<string, any>} pInputRecord - The input record to use when resolving the output recordset address mapping.
     *
     * @return {string|null} - The resolved output recordset address, or null if no mapping was found.
     */
    _resolveOutputRecordsetAddressMapping(pConfiguration: Record<string, any>, pContext: Record<string, any>, pInputRecord: Record<string, any>): string | null;
    /**
     * @param {Record<string, any>} pCustomRequestInformation - The custom request information object.
     * @param {Record<string, any>} pContext - The context object to use when parsing templates and resolving addresses.
     * @param {(pError?: Error) => void} fCallback - The callback function to call when the operation is complete, which should take an optional error as its first parameter and the data set as its second parameter.
     */
    gatherCustomDataSet(pCustomRequestInformation: Record<string, any>, pContext: Record<string, any>, fCallback: (pError?: Error) => void): any;
    /**
     * Local version of gatherDataFromServer that only support synchronous operations.
     *
     * @param {Array<Record<string, any>>} pEntitiesBundleDescription - The entity bundle description object.
     */
    processBundle(pEntitiesBundleDescription: Array<Record<string, any>>): void;
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
    extractStepDependencies(pStep: Record<string, any>): Set<string>;
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
    buildBundleWaves(pEntitiesBundleDescription: Array<Record<string, any>>): Array<Array<{
        Index: number;
        Step: Record<string, any>;
    }>>;
    gatherDataFromServer(pEntitiesBundleDescription: any, fCallback: any): any;
    /**
     * Creates a wrapper state object to allow referencing common global state in addition to flow-state.
     *
     * @param {Record<string, any>} pState - The state object to prepare.
     * @param {any} [pStepConfiguration] - (optional) The step configuration object provided in the config, if any.
     * @return {Record<string, any>} - The prepared state object.
     */
    prepareState(pState: Record<string, any>, pStepConfiguration?: any): Record<string, any>;
    /**
     * @param {string} pEntity - The name of the entity to get.
     * @param {string|number} pIDRecord - The ID of the record to get.
     * @param {(pError?: Error, pRecord?: any) => void} fCallback - The callback function to call when the operation is complete.
     */
    getEntity(pEntity: string, pIDRecord: string | number, fCallback: (pError?: Error, pRecord?: any) => void, pScope?: string): void;
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
    cacheConnectedEntityRecordsWithoutCount(pRecordSet: any[], pIDListToCache: any[], pEntityListToCache: any[], pLiteRecords: boolean, fCallback: any, pScope?: string): void;
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
    getEntitySetByIDListChunked(pEntityName: string, pIDRecordsArray: Array<number | string>, pOptions: any, fCallback: (error?: Error) => void): void;
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
    cacheConnectedEntityRecords(pRecordSet: any[], pIDListToCache: any[], pEntityListToCache: any[], pLiteRecords: boolean, fCallback: any, pScope?: string): void;
    /**
     * Cache an array of records, likely from a meadow endpoint
     *
     * @param {string} pEntity - The entity type to cache individual records for
     * @param {Array<Record<string, any>>} pRecordSet - An array of records to cache
     */
    cacheIndividualEntityRecords(pEntity: string, pRecordSet: Array<Record<string, any>>, pScope?: string): void;
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
    getEntitySetPage(pEntity: string, pMeadowFilterExpression: string, pRecordStartCursor: number, pRecordCount: number, fCallback: (pError?: Error, pEntitySet?: Array<Record<string, any>>) => void, postfix?: string, pURLPrefix?: string, pOptions?: Record<string, any>): void;
    /**
     * @param {string} pEntity - The name of the entity to get the count of.
     * @param {string} pMeadowFilterExpression - The meadow filter expression to filter the entity set by.
     * @param {(pError?: Error, pRecordCount?: number) => void} fCallback - The callback function to call when the operation is complete.
     * @param {string} [postfix] - Optional, adds a postfix string to the count url
     * @param {string} [pURLPrefix] - Optional per-request URL prefix; overrides the provider default.
     */
    getEntitySetRecordCount(pEntity: string, pMeadowFilterExpression: string, fCallback: (pError?: Error, pRecordCount?: number) => void, postfix?: string, pURLPrefix?: string): void;
    /**
     * @param {string} pEntity - The name of the entity to get.
     * @param {string} pMeadowFilterExpression - The meadow filter expression to filter the entity set by.
     * @param {(pError?: Error, pEntitySet?: Array<Record<string, any>>) => void} fCallback - The callback function to call when the operation is complete.
     */
    getEntitySetWithAutoCaching(pEntity: string, pMeadowFilterExpression: string, fCallback: (pError?: Error, pEntitySet?: Array<Record<string, any>>) => void): void;
    /**
     * @param {string} pEntity - The entity to get a set of.
     * @param {string} pMeadowFilterExpression - The meadow filter expression to filter the entity set by.
     * @param {(pError?: Error, pEntitySet?: Array) => void} fCallback - The callback to call when the request is complete.
     * @param {string} [postfix] - Optional, adds a postfix string to all calls made.
     * @param {Record<string, any>} [pOptions] - Optional, per-call options (e.g. { DownloadPageConcurrency: 1 }).
     *
     * @return {void}
     */
    getEntitySet(pEntity: string, pMeadowFilterExpression: string, fCallback: (pError?: Error, pEntitySet?: any[]) => void, postfix?: string, pOptions?: Record<string, any>): void;
    /**
     * @param {string} pEntityType - The type of the entity to format the URL for.
     *
     * @return {string} - The formatted URL for the given entity type.
     */
    formatUrl(pEntityType: string): string;
    /**
     * Create a new entity record.
     *
     * @param {string} pEntityType - The entity type to create.
     * @param {Record<string, any>} pRecord - The record to create.
     * @param {(pError?: Error, pResult?: Record<string, any>) => void} fCallback - The callback to call when the request is complete.
     *
     * @return {void}
     */
    createEntity(pEntityType: string, pRecord: Record<string, any>, fCallback: (pError?: Error, pResult?: Record<string, any>) => void): void;
    /**
     * Update an entity record.
     *
     * @param {string} pEntityType - The entity type to create.
     * @param {Record<string, any>} pRecord - The record to create.
     * @param {(pError?: Error, pResult?: Record<string, any>) => void} fCallback - The callback to call when the request is complete.
     *
     * @return {void}
     */
    updateEntity(pEntityType: string, pRecord: Record<string, any>, fCallback: (pError?: Error, pResult?: Record<string, any>) => void): void;
    /**
     * Upsert an entity record.
     *
     * @param {String} pEntityType - The entity type to be upserted.
     * @param {Object<String, any>} pRecord - The record to upsert.
     * @param {(pError?: Error, pResult?: any) => void} fCallback - The callback to call when the request is complete.
     *
     * @return {void}
     */
    upsertEntity(pEntityType: string, pRecord: any, fCallback: (pError?: Error, pResult?: any) => void): void;
    /**
     * Upsert a array of entity records.
     *
     * @param {string} pEntityType - The entity type to be upserted.
     * @param {Array<Record<string, any>>} pRecords - The records to upsert.
     * @param {(pError?: Error, pResults?: Array<any>) => void} fCallback - The callback to call when the request is complete.
     *
     * @return {void}
     */
    upsertEntities(pEntityType: string, pRecords: Array<Record<string, any>>, fCallback: (pError?: Error, pResults?: Array<any>) => void): void;
    /**
     * Delete an entity record.
     *
     * @param {string} pEntityType - The entity type to create.
     * @param {string | Number} pIDRecord - The ID of the record to delete.
     * @param {(pError?: Error, pResult?: Record<string, any>) => void} fCallback - The callback to call when the request is complete.
     *
     * @return {void}
     */
    deleteEntity(pEntityType: string, pIDRecord: string | number, fCallback: (pError?: Error, pResult?: Record<string, any>) => void): void;
}
//# sourceMappingURL=Pict-Meadow-EntityProvider.d.ts.map