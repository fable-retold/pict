export = FilterMeadowStanzaTokenGenerator;
/**
 * @typedef {{
 *   ValueTemplate?: string,
 *   Value?: string,
 *   CoreEntity: string,
 *   Instruction: string,
 *   Operator: string,
 *   Fields: string[],
 * }} FilterConnection
 *
 * @typedef {{
 *   GUID: string,
 *   Filters: Array<Record<string, any>>,
 *   JoinConfig?: FilterConnection,
 * 	 Ordinal?: number,
 * 	 Junction?: string,
 * 	 GroupOpen?: boolean,
 *   GroupJunction?: string,
 *   GroupClose?: boolean
 * }} PreparedFilter
 *
 * * @typedef {{
 *   PreparedFilters?: Array<PreparedFilter>,
 *   Junction?: string,
 *   Ordinal?: number,
 *   GUIDGroup: string
 * }} FilterGroup
 *
 * @typedef {{
 *   Entity: string,
 * 	 Groups: Array<FilterGroup>,
 *   Filter: string,
 *   ResultDestinationAddress: string,
 *   Mode?: 'Count' | 'Records',
 *   RecordOffset?: number,
 *   PageSize?: number,
 *   FilterConfiguration: Array<Record<string, any>>,
 *   PreparedFilters: Array<PreparedFilter>,
 *   BundleConfig?: Array<Record<string, any>>,
 *   UserFilters?: Array<string>,
 * 	 Postfix?: string,
 * 	 Scope?: string,
 * 	 Projection?: Record<string, any>,
 * }} FilterState
 *
 * @typedef { 'None' |
 * 'Match' | 'StringMatch' | 'DateMatch' | 'NumericMatch' |
 * 'Range' | 'StringRange' | 'DateRange' | 'NumericRange' |
 * 'DistinctSelectedValueList' |
 * 'InternalJoinMatch' | 'InternalJoinStringMatch' | 'InternalJoinNumericMatch' | 'InternalJoinDateMatch' |
 * 'InternalJoinRange' | 'InternalJoinStringRange' | 'InternalJoinNumericRange' | 'InternalJoinDateRange'  | 'InternalJoinSelectedValue' | 'InternalJoinSelectedValueList' |
 * 'ExternalJoinMatch' | 'ExternalJoinStringMatch' | 'ExternalJoinNumericMatch' | 'ExternalJoinDateMatch' |
 * 'ExternalJoinRange' | 'ExternalJoinStringRange' | 'ExternalJoinNumericRange' | 'ExternalJoinDateRange' | 'ExternalJoinSelectedValue' | 'ExternalJoinSelectedValueList' } FilterType
 */
declare class FilterMeadowStanzaTokenGenerator {
    /**
     * @param {import('../Pict.js')} pFable
     */
    constructor(pFable: import("../Pict.js"));
    fable: import("../Pict.js");
    pict: import("../Pict.js");
    log: any;
    /**
     * @param {FilterState} pFilterState
     */
    generateMeadowFilterStanzas(pFilterState: FilterState): void;
    /**
     * @param {FilterState} pFilterState
     */
    linkPreparedFilters(pFilterState: FilterState): Record<string, any>[][];
    /**
     * Generate a computed index for each filter in the meadow filter stanzas such that the overall address space is non-overlapping and stable.
     *
     * @param {FilterState} pFilterState
     */
    normalizeMeadowFilterStanzas(pFilterState: FilterState): void;
    /**
     * @param {FilterState} pFilterState
     */
    compileMeadowFilterStanzas(pFilterState: FilterState): void;
    /**
     * @param {string} pFilter
     *
     * @return {string}
     */
    _sanitizeFilterForCount(pFilter: string): string;
    /**
     * @param {string} pFilter
     *
     * @return {Array<string>}
     */
    _extractSortsFromFilter(pFilter: string): Array<string>;
    _compileSimpleFilterToString(pFilter: any): string;
}
declare namespace FilterMeadowStanzaTokenGenerator {
    export { FilterConnection, PreparedFilter, FilterGroup, FilterState, FilterType };
}
type FilterConnection = {
    ValueTemplate?: string;
    Value?: string;
    CoreEntity: string;
    Instruction: string;
    Operator: string;
    Fields: string[];
};
/**
 * *
 */
type PreparedFilter = {
    GUID: string;
    Filters: Array<Record<string, any>>;
    JoinConfig?: FilterConnection;
    Ordinal?: number;
    Junction?: string;
    GroupOpen?: boolean;
    GroupJunction?: string;
    GroupClose?: boolean;
};
type FilterGroup = {
    PreparedFilters?: Array<PreparedFilter>;
    Junction?: string;
    Ordinal?: number;
    GUIDGroup: string;
};
type FilterState = {
    Entity: string;
    Groups: Array<FilterGroup>;
    Filter: string;
    ResultDestinationAddress: string;
    Mode?: "Count" | "Records";
    RecordOffset?: number;
    PageSize?: number;
    FilterConfiguration: Array<Record<string, any>>;
    PreparedFilters: Array<PreparedFilter>;
    BundleConfig?: Array<Record<string, any>>;
    UserFilters?: Array<string>;
    Postfix?: string;
    Scope?: string;
    Projection?: Record<string, any>;
};
type FilterType = "None" | "Match" | "StringMatch" | "DateMatch" | "NumericMatch" | "Range" | "StringRange" | "DateRange" | "NumericRange" | "DistinctSelectedValueList" | "InternalJoinMatch" | "InternalJoinStringMatch" | "InternalJoinNumericMatch" | "InternalJoinDateMatch" | "InternalJoinRange" | "InternalJoinStringRange" | "InternalJoinNumericRange" | "InternalJoinDateRange" | "InternalJoinSelectedValue" | "InternalJoinSelectedValueList" | "ExternalJoinMatch" | "ExternalJoinStringMatch" | "ExternalJoinNumericMatch" | "ExternalJoinDateMatch" | "ExternalJoinRange" | "ExternalJoinStringRange" | "ExternalJoinNumericRange" | "ExternalJoinDateRange" | "ExternalJoinSelectedValue" | "ExternalJoinSelectedValueList";
//# sourceMappingURL=Filter.d.ts.map