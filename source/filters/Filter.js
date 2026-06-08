
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
 * 	 Postfix?: string
 * }} FilterState
 *
 * @typedef { 'None' |
 * 'Match' | 'StringMatch' | 'DateMatch' | 'NumericMatch' |
 * 'Range' | 'StringRange' | 'DateRange' | 'NumericRange' |
 * 'InternalJoinMatch' | 'InternalJoinStringMatch' | 'InternalJoinNumericMatch' | 'InternalJoinDateMatch' |
 * 'InternalJoinRange' | 'InternalJoinStringRange' | 'InternalJoinNumericRange' | 'InternalJoinDateRange'  | 'InternalJoinSelectedValue' | 'InternalJoinSelectedValueList' |
 * 'ExternalJoinMatch' | 'ExternalJoinStringMatch' | 'ExternalJoinNumericMatch' | 'ExternalJoinDateMatch' |
 * 'ExternalJoinRange' | 'ExternalJoinStringRange' | 'ExternalJoinNumericRange' | 'ExternalJoinDateRange' | 'ExternalJoinSelectedValue' | 'ExternalJoinSelectedValueList' } FilterType
 */

class FilterMeadowStanzaTokenGenerator
{
	/**
	 * @param {import('../Pict.js')} pFable
	 */
	constructor(pFable)
	{
		this.fable = pFable;
		this.pict = pFable;
		this.log = pFable.log;
	}

	/**
	 * @param {FilterState} pFilterState
	 */
	generateMeadowFilterStanzas(pFilterState)
	{
		let tmpResult = [];
		pFilterState.UserFilters = [];
		const groupedFilterStates = {};
		if (Array.isArray(pFilterState.Groups))
		{
			for (let g of pFilterState.Groups)
			{
				groupedFilterStates[g.GUIDGroup] =
				Object.assign({
					PreparedFilters: [],
					Junction: 'AND',
					Ordinal: 0
				}, g);
			}
		}
		for (const tmpFilterConfig of pFilterState.FilterConfiguration || [])
		{
			if (tmpFilterConfig.Enabled === false)
			{
				if (this.pict.LogNoisiness > 1)
				{
					this.log.info(`Skipping disabled filter configuration: ${tmpFilterConfig.Type}`, { FilterConfig: tmpFilterConfig });
				}
				continue;
			}
			/** @type {PreparedFilter} */
			const tmpFilterResult = { GUID: this.pict.getUUID(), Filters: [], Ordinal: tmpFilterConfig.Ordinal || 0, Junction: tmpFilterConfig.Junction || 'AND' };
			const tmpValuesArray = Array.isArray(tmpFilterConfig.Values) ? tmpFilterConfig.Values : tmpFilterConfig.Value != null && tmpFilterConfig.Value != '' && (tmpFilterConfig.Type != 'ExternalJoinDateMatch' || tmpFilterConfig.Value != 0) ? [ tmpFilterConfig.Value ] : [];
			let tmpFilterByColumns;
			switch (tmpFilterConfig.Type)
			{
				case 'ExternalJoinSelectedValue':
				case 'ExternalJoinSelectedValueList':
					tmpFilterByColumns = [ tmpFilterConfig.ExternalFilterTableLookupColumn || `ID${tmpFilterConfig.ExternalFilterByTable}` ];
					// fall through
				case 'ExternalJoinMatch':
				case 'ExternalJoinStringMatch':
				case 'ExternalJoinDateMatch':
				case 'ExternalJoinNumericMatch':
					/*
					  "Values": [ "John", "Jane" ],
					  "ExternalFilterByColumns": [ "Name" ],
					  "ExactMatch": false,

					  "CoreConnectionColumn": "IDBook",

					  "JoinTable": "BookAuthorJoin",
					  "JoinTableExternalConnectionColumn": "IDAuthor",
					  "JoinTableCoreConnectionColumn": "IDBook",

					  "ExternalFilterByTable": "Author",
					  "ExternalFilterByTableConnectionColumn": "IDAuthor",
					 */
					if (!tmpFilterByColumns)
					{
						tmpFilterByColumns = tmpFilterConfig.ExternalFilterByColumns || (tmpFilterConfig.ExternalFilterByColumn ? [ tmpFilterConfig.ExternalFilterByColumn ] : [ 'Name' ]);
					}
					for (const tmpField of tmpFilterByColumns)
					{
						for (const tmpValue of tmpValuesArray)
						{
							const tmpFilter =
							{
								Index: -1,
								Entity: tmpFilterConfig.ExternalFilterByTable,
								Instruction: 'FBVOR',
								Field: tmpField,
							};
							if (tmpFilterConfig.ExactMatch || (typeof tmpFilterConfig.ExactMatch === 'undefined' &&
									(tmpFilterConfig.Type == 'ExternalJoinNumericMatch' || tmpFilterConfig.Type == 'ExternalJoinDateMatch' || tmpFilterConfig.Type == 'ExternalJoinSelectedValue' || tmpFilterConfig.Type == 'ExternalJoinSelectedValueList')))
							{
								//TODO: optimize this to use in-list, but requires restructuring of this code
								tmpFilter.Operator = 'EQ';
								tmpFilter.Value = tmpValue;
							}
							else
							{
								tmpFilter.Operator = 'LK';
								tmpFilter.Value = `%25${tmpValue}%25`; //FIXME: point of URI encoding needs to be addressed
							}
							tmpFilterResult.Filters.push(tmpFilter);
						}
					}
					if (!tmpFilterConfig.JoinTable)
					{
						this.log.error(`${tmpFilterConfig.Type} filter missing JoinTable, cannot filter join table.`, { FilterConfig: tmpFilterConfig });
						break;
					}
					if (!tmpFilterConfig.JoinTableExternalConnectionColumn)
					{
						this.log.error(`${tmpFilterConfig.Type} filter missing JoinTableExternalConnectionColumn, cannot filter join table [${tmpFilterConfig.JoinTable}].`);
						break;
					}
					if (tmpFilterResult.Filters.length > 0)
					{
						tmpFilterResult.Filters.push(
						{
							Index: 0,
							Fulcrum: true,
							Entity: tmpFilterConfig.JoinTable,
							Instruction: 'FBL',
							Field: tmpFilterConfig.JoinTableExternalConnectionColumn,
							Operator: 'INN',
							ValueTemplate: `{~PJU:,^${tmpFilterConfig.ExternalFilterByTableConnectionColumn || tmpFilterConfig.JoinTableExternalConnectionColumn}^Record.State[Step-1]~}`,
						});
						if (tmpFilterConfig.PolyJoinRemoteType)
						{
							tmpFilterResult.Filters.push(
							{
								Index: 0,
								Fulcrum: true,
								Entity: tmpFilterConfig.JoinTable,
								Instruction: 'FBV',
								Field: tmpFilterConfig.PolyJoinRemoteColumn || 'RemoteType',
								Operator: 'EQ',
								ValueTemplate: tmpFilterConfig.PolyJoinRemoteType,
							});
						}
						if (!tmpFilterConfig.CoreConnectionColumn)
						{
							this.log.error(`${tmpFilterConfig.Type} filter missing CoreConnectionColumn, cannot filter core table [${pFilterState.Entity}].`);
							break;
						}
						tmpFilterResult.JoinConfig =
						{
							CoreEntity: pFilterState.Entity,
							Instruction: 'FBLOR',
							Fields: [ tmpFilterConfig.CoreConnectionColumn ],
							Operator: 'INN',
							ValueTemplate: `{~PJU:,^${tmpFilterConfig.JoinTableCoreConnectionColumn}^Record.State[Step0]~}`,
						};
					}
					break;
				case 'ExternalJoinStringRange':
				case 'ExternalJoinNumericRange':
				case 'ExternalJoinDateRange':
				case 'ExternalJoinRange':
					if (!tmpFilterConfig.Values || (tmpFilterConfig.Values.Start == null && tmpFilterConfig.Values.End == null))
					{
						break;
					}

					// do not honor '0' for dates
					if (tmpFilterConfig.Type == 'ExternalJoinDateRange')
					{
						if ((!tmpFilterConfig.Values.Start || tmpFilterConfig.Values.Start == '0') &&
								(!tmpFilterConfig.Values.End || tmpFilterConfig.Values.End == '0'))
						{
							break;
						}
					}

					for (const tmpField of tmpFilterConfig.ExternalFilterByColumns || (tmpFilterConfig.ExternalFilterByColumn ? [ tmpFilterConfig.ExternalFilterByColumn ] : [ 'Name' ]))
					{
						const hasStartValue = tmpFilterConfig.Values && tmpFilterConfig.Values.Start && (tmpFilterConfig.Type != 'ExternalJoinDateRange' || tmpFilterConfig.Values.Start != '0');
						const hasEndValue = tmpFilterConfig.Values && tmpFilterConfig.Values.End && (tmpFilterConfig.Type != 'ExternalJoinDateRange' || tmpFilterConfig.Values.End != '0');
						if (hasStartValue)
						{
							tmpFilterResult.Filters.push(
							{
								Index: -1,
								Entity: tmpFilterConfig.ExternalFilterByTable,
								Instruction: 'FBVOR',
								OpenParen: true,
								OpenParenOr: true,
								CloseParen: !hasEndValue,
								Field: tmpField,
								Operator: tmpFilterConfig.StartExclusive ? 'GT' : 'GE',
								Value: tmpFilterConfig.Values.Start,
							});
						}
						if (hasEndValue)
						{
							tmpFilterResult.Filters.push(
							{
								Index: -1,
								Entity: tmpFilterConfig.ExternalFilterByTable,
								Instruction: 'FBV',
								OpenParen: !hasStartValue,
								OpenParenOr: !hasStartValue,
								CloseParen: true,
								Field: tmpField,
								Operator: tmpFilterConfig.EndExclusive ? 'LT' : 'LE',
								Value: tmpFilterConfig.Values.End,
							});
						}
					}
					if (!tmpFilterConfig.JoinTable)
					{
						this.log.error(`${tmpFilterConfig.Type} filter missing JoinTable, cannot filter join table.`, { FilterConfig: tmpFilterConfig });
						break;
					}
					if (!tmpFilterConfig.JoinTableExternalConnectionColumn)
					{
						this.log.error(`${tmpFilterConfig.Type} filter missing JoinTableExternalConnectionColumn, cannot filter join table [${tmpFilterConfig.JoinTable}].`);
						break;
					}
					if (tmpFilterResult.Filters.length > 0)
					{
						tmpFilterResult.Filters.push(
						{
							Index: 0,
							Fulcrum: true,
							Entity: tmpFilterConfig.JoinTable,
							Instruction: 'FBL',
							Field: tmpFilterConfig.JoinTableExternalConnectionColumn,
							Operator: 'INN',
							ValueTemplate: `{~PJU:,^${tmpFilterConfig.ExternalFilterByTableConnectionColumn || tmpFilterConfig.JoinTableExternalConnectionColumn}^Record.State[Step-1]~}`,
						});
						if (tmpFilterConfig.PolyJoinRemoteType)
						{
							tmpFilterResult.Filters.push(
							{
								Index: 0,
								Fulcrum: true,
								Entity: tmpFilterConfig.JoinTable,
								Instruction: 'FBV',
								Field: tmpFilterConfig.PolyJoinRemoteColumn || 'RemoteType',
								Operator: 'EQ',
								ValueTemplate: tmpFilterConfig.PolyJoinRemoteType,
							});
						}
						if (!tmpFilterConfig.CoreConnectionColumn)
						{
							this.log.error(`${tmpFilterConfig.Type} filter missing CoreConnectionColumn, cannot filter core table [${pFilterState.Entity}].`);
							break;
						}
						if (!tmpFilterConfig.JoinTableCoreConnectionColumn)
						{
							this.log.error(`${tmpFilterConfig.Type} filter missing JoinTableCoreConnectionColumn, cannot filter core table [${pFilterState.Entity}].`);
							break;
						}
						tmpFilterResult.JoinConfig =
						{
							CoreEntity: pFilterState.Entity,
							Instruction: 'FBLOR',
							Fields: [ tmpFilterConfig.CoreConnectionColumn ],
							Operator: 'INN',
							ValueTemplate: `{~PJU:,^${tmpFilterConfig.JoinTableCoreConnectionColumn}^Record.State[Step0]~}`,
						};
					}
					break;
				case 'StringRange':
				case 'DateRange':
				case 'NumericRange':
				case 'Range':
					if (!tmpFilterConfig.Values || (tmpFilterConfig.Values.Start == null && tmpFilterConfig.Values.End == null))
					{
						break;
					}

					// do not honor '0' for dates
					if (tmpFilterConfig.Type == 'DateRange')
					{
						if ((!tmpFilterConfig.Values.Start || tmpFilterConfig.Values.Start == '0') &&
								(!tmpFilterConfig.Values.End || tmpFilterConfig.Values.End == '0'))
						{
							break;
						}
					}
					/*
					  "Values":
					  {
						  "Start": "2023-01-01T00:00:00Z",
						  "End": "2024-01-01T00:00:00Z"
					  },
					  "FilterByColumn": "CreateDate",
					 */
					for (const tmpField of tmpFilterConfig.FilterByColumns || (tmpFilterConfig.FilterByColumn ? [ tmpFilterConfig.FilterByColumn ] : [ 'Name' ]))
					{
						const hasStartValue = tmpFilterConfig.Values && tmpFilterConfig.Values.Start && (tmpFilterConfig.Type != 'DateRange' || tmpFilterConfig.Values.Start != '0');
						const hasEndValue = tmpFilterConfig.Values && tmpFilterConfig.Values.End && (tmpFilterConfig.Type != 'DateRange' || tmpFilterConfig.Values.End != '0');
						if (hasStartValue)
						{
							tmpFilterResult.Filters.push(
							{
								Index: 0,
								CoreEntity: true,
								Entity: pFilterState.Entity,
								Instruction: 'FBVOR',
								Field: tmpField,
								OpenParen: true,
								OpenParenOr: true,
								CloseParen: !hasEndValue,
								Operator: tmpFilterConfig.StartExclusive ? 'GT' : 'GE',
								Value: tmpFilterConfig.Values.Start,
							});
						}
						if (hasEndValue)
						{
							tmpFilterResult.Filters.push(
							{
								Index: 0,
								CoreEntity: true,
								Entity: pFilterState.Entity,
								Instruction: 'FBV',
								OpenParen: !hasStartValue,
								OpenParenOr: !hasStartValue,
								CloseParen: true,
								Field: tmpField,
								Operator: tmpFilterConfig.EndExclusive ? 'LT' : 'LE',
								Value: tmpFilterConfig.Values.End,
							});
						}
					}
					break;
				case 'StringMatch':
				case 'DateMatch':
				case 'NumericMatch':
				case 'Match':
					/*
					  "Values": [ "John", "Jane" ],
					  "FilterByColumn": "Name",
					  "ExactMatch": false,
					 */
					for (const tmpField of tmpFilterConfig.FilterByColumns || (tmpFilterConfig.FilterByColumn ? [ tmpFilterConfig.FilterByColumn ] : [ 'Name' ]))
					{
						for (const tmpValue of tmpValuesArray)
						{
							const tmpFilter =
							{
								Index: 0,
								CoreEntity: true,
								Entity: pFilterState.Entity,
								Instruction: 'FBVOR',
								Field: tmpField,
							};
							// don't use like for numbers
							if (tmpFilterConfig.ExactMatch || (typeof tmpFilterConfig.ExactMatch === 'undefined' &&
									(tmpFilterConfig.Type == 'NumericMatch' || tmpFilterConfig.Type == 'DateMatch')))
							{
								tmpFilter.Operator = 'EQ';
								tmpFilter.Value = tmpValue;
							}
							else
							{
								tmpFilter.Operator = 'LK';
								tmpFilter.Value = `%25${tmpValue}%25`; //FIXME: figure out a cleaner way to do URL encoding for these - probably, should be downstream, but isn't currently
							}
							tmpFilterResult.Filters.push(tmpFilter);
						}
					}
					break;
				case 'InternalJoinStringRange':
				case 'InternalJoinNumericRange':
				case 'InternalJoinDateRange':
				case 'InternalJoinRange':
					if (!tmpFilterConfig.Values || (tmpFilterConfig.Values.Start == null && tmpFilterConfig.Values.End == null))
					{
						break;
					}

					// do not honor '0' for dates
					if (tmpFilterConfig.Type == 'InternalJoinDateRange')
					{
						if ((!tmpFilterConfig.Values.Start || tmpFilterConfig.Values.Start == '0') &&
								(!tmpFilterConfig.Values.End || tmpFilterConfig.Values.End == '0'))
						{
							break;
						}
					}

					for (const tmpField of tmpFilterConfig.ExternalFilterByColumns || (tmpFilterConfig.ExternalFilterByColumn ? [ tmpFilterConfig.ExternalFilterByColumn ] : [ 'Name' ]))
					{
						const hasStartValue = tmpFilterConfig.Values && tmpFilterConfig.Values.Start && (tmpFilterConfig.Type != 'InternalJoinDateRange' || tmpFilterConfig.Values.Start != '0');
						const hasEndValue = tmpFilterConfig.Values && tmpFilterConfig.Values.End && (tmpFilterConfig.Type != 'InternalJoinDateRange' || tmpFilterConfig.Values.End != '0');
						if (hasStartValue)
						{
							tmpFilterResult.Filters.push(
							{
								Index: 0,
								Entity: tmpFilterConfig.RemoteTable,
								Instruction: 'FBVOR',
								Field: tmpField,
								OpenParen: true,
								OpenParenOr: true,
								CloseParen: !hasEndValue,
								Operator: tmpFilterConfig.StartExclusive ? 'GT' : 'GE',
								Value: tmpFilterConfig.Values.Start,
							});
						}
						if (hasEndValue)
						{
							tmpFilterResult.Filters.push(
							{
								Index: 0,
								Entity: tmpFilterConfig.RemoteTable,
								Instruction: 'FBV',
								OpenParen: !hasStartValue,
								OpenParenOr: !hasStartValue,
								CloseParen: true,
								Field: tmpField,
								Operator: tmpFilterConfig.EndExclusive ? 'LT' : 'LE',
								Value: tmpFilterConfig.Values.End,
							});
						}
					}
					if (tmpFilterResult.Filters.length > 0)
					{
						if (!tmpFilterConfig.JoinInternalConnectionColumn)
						{
							this.log.error(`${tmpFilterConfig.Type} filter missing JoinInternalConnectionColumn, cannot filter core table [${pFilterState.Entity}].`);
							break;
						}
						tmpFilterResult.JoinConfig =
						{
							Instruction: 'FBLOR',
							CoreEntity: pFilterState.Entity,
							Fields: [ tmpFilterConfig.JoinInternalConnectionColumn ],
							Operator: 'INN',
							ValueTemplate: `{~PJU:,^${tmpFilterConfig.JoinExternalConnectionColumn}^Record.State[Step0]~}`,
						};
					}
					break;
				case 'InternalJoinSelectedValue':
				case 'InternalJoinSelectedValueList':
					tmpFilterByColumns = [ tmpFilterConfig.ExternalFilterTableLookupColumn || `ID${tmpFilterConfig.RemoteTable}` ];
					// fall through
				case 'InternalJoinMatch':
				case 'InternalJoinStringMatch':
				case 'InternalJoinDateMatch':
				case 'InternalJoinNumericMatch':
					/*
					  "Values": [ "Bob" ],
                      "RemoteTable": "User",
                      "ExternalFilterByColumns": [ "NameFirst", "NameLast" ],
                      "JoinExternalConnectionColumn": "IDUser",
                      "JoinInternalConnectionColumn": "CreatingIDUser",
					 */
					if (!tmpFilterByColumns)
					{
						tmpFilterByColumns = tmpFilterConfig.ExternalFilterByColumns || (tmpFilterConfig.ExternalFilterByColumn ? [ tmpFilterConfig.ExternalFilterByColumn ] : [ 'Name' ]);
					}
					for (const tmpField of tmpFilterByColumns)
					{
						for (const tmpValue of tmpValuesArray)
						{
							const tmpFilter =
							{
								Index: 0,
								Entity: tmpFilterConfig.RemoteTable,
								Instruction: 'FBVOR',
								Field: tmpField,
							};
							if (tmpFilterConfig.ExactMatch || (typeof tmpFilterConfig.ExactMatch === 'undefined' &&
									(tmpFilterConfig.Type == 'InternalJoinNumericMatch' || tmpFilterConfig.Type == 'InternalJoinDateMatch' || tmpFilterConfig.Type == 'InternalJoinSelectedValue' || tmpFilterConfig.Type == 'InternalJoinSelectedValueList')))
							{
								//TODO: optimize this to use in-list, but requires restructuring of this code
								tmpFilter.Operator = 'EQ';
								tmpFilter.Value = tmpValue;
							}
							else
							{
								tmpFilter.Operator = 'LK';
								tmpFilter.Value = `%25${tmpValue}%25`;
							}
							tmpFilterResult.Filters.push(tmpFilter);
						}
					}
					if (tmpFilterResult.Filters.length > 0)
					{
						if (!tmpFilterConfig.JoinInternalConnectionColumn)
						{
							this.log.error(`${tmpFilterConfig.Type} filter missing JoinInternalConnectionColumn, cannot filter core table [${pFilterState.Entity}].`);
							break;
						}
						tmpFilterResult.JoinConfig =
						{
							Instruction: 'FBLOR',
							CoreEntity: pFilterState.Entity,
							Fields: [ tmpFilterConfig.JoinInternalConnectionColumn ],
							Operator: 'INN',
							ValueTemplate: `{~PJU:,^${tmpFilterConfig.JoinExternalConnectionColumn}^Record.State[Step0]~}`,
						};
					}
					break;
				case 'RawFilter':
					if (!tmpFilterConfig.Value)
					{
						this.log.warn(`RawFilter configuration missing Value, not adding filter.`, { FilterConfig: tmpFilterConfig });
						break;
					}
					pFilterState.UserFilters.push(tmpFilterConfig.Value);
					break;
				default:
					this.log.warn(`Unknown filter type ${tmpFilterConfig.Type} in filter configuration.`, { FilterConfig: tmpFilterConfig });
			}
			if (tmpFilterResult.Filters.length > 0)
			{
				if (tmpFilterConfig.GUIDGroup)
				{
					if (groupedFilterStates[tmpFilterConfig.GUIDGroup])
					{
						groupedFilterStates[tmpFilterConfig.GUIDGroup].PreparedFilters.push(tmpFilterResult);
					}
					else
					{
						groupedFilterStates[tmpFilterConfig.GUIDGroup] = 
						{
							PreparedFilters: [tmpFilterResult],
							Junction: 'AND',
							Ordinal: 0
						};
					}
				}
				else
				{
					tmpResult.push(tmpFilterResult);
				}
			}
		}
		const sortSet = (arr) =>
		{
			for (let x = 0; x < arr.length; x++)
			{
				arr[x].Ordinal = arr[x].Ordinal || 0;
			}
			return arr.sort((a, b) => 
			{
				if (a.Ordinal > b.Ordinal)
				{
					return 1;
				}
				else if (b.Ordinal > a.Ordinal)
				{
					return -1;
				}
				return 0;
			});
		};
		const spreadGroupings = (arr) =>
		{
			const outputSet = [];
			for (const group of arr)
			{
				if (group.PreparedFilters)
				{
					group.PreparedFilters[0].GroupOpen = true;
					group.PreparedFilters[0].GroupJunction = group.Junction;
					group.PreparedFilters[group.PreparedFilters.length - 1].GroupClose = true;
					for (let x = 0; x < group.PreparedFilters.length; x++)
					{
						outputSet.push(group.PreparedFilters[x]);
					}
				}
				else
				{
					outputSet.push(group);
				}
			}
			return outputSet;
		};
		for (let g of Object.keys(groupedFilterStates))
		{
			if (groupedFilterStates[g].PreparedFilters?.length)
			{
				groupedFilterStates[g].PreparedFilters = sortSet(groupedFilterStates[g].PreparedFilters);
			}
			tmpResult.push(groupedFilterStates[g]);
		}
		tmpResult = spreadGroupings(sortSet(tmpResult));
		pFilterState.PreparedFilters = tmpResult;
	}

	/**
	 * @param {FilterState} pFilterState
	 */
	linkPreparedFilters(pFilterState)
	{
		const tmpGroupedStanzas = [];
		for (const tmpPreparedFilter of pFilterState.PreparedFilters || [])
		{
			if (tmpPreparedFilter.JoinConfig)
			{
				const tmpSubGroup = tmpPreparedFilter.Filters;
				const tmpJoinConfig = tmpPreparedFilter.JoinConfig;
				for (const tmpField of tmpJoinConfig.Fields || [])
				{
					const tmpStanza =
					{
						Index: 1,
						CoreEntity: true,
						Entity: tmpPreparedFilter.JoinConfig.CoreEntity,
						Instruction: tmpPreparedFilter.JoinConfig.Instruction || 'FBVOR',
						Field: tmpField,
						Operator: tmpJoinConfig.Operator,
						Value: tmpJoinConfig.Value,
						ValueTemplate: tmpJoinConfig.ValueTemplate,
					};
					tmpSubGroup.push(tmpStanza);
				}
				tmpGroupedStanzas.push(tmpSubGroup);
			}
			else
			{
				tmpGroupedStanzas.push(tmpPreparedFilter.Filters);
			}
		}
		return tmpGroupedStanzas;
	}

	/**
	 * Generate a computed index for each filter in the meadow filter stanzas such that the overall address space is non-overlapping and stable.
	 *
	 * @param {FilterState} pFilterState
	 */
	normalizeMeadowFilterStanzas(pFilterState)
	{
		let tmpTotalIndexCount = 0;
		for (const tmpFilterGroup of pFilterState.PreparedFilters)
		{
			const tmpLocalIndices = new Set();
			tmpFilterGroup.Filters.sort((a, b) => a.Index - b.Index);
			for (const tmpFilter of tmpFilterGroup.Filters)
			{
				if (!tmpFilter.CoreEntity)
				{
					tmpLocalIndices.add(tmpFilter.Index);
				}
			}
			tmpTotalIndexCount += tmpLocalIndices.size;
		}

		let tmpComputedIndex = -tmpTotalIndexCount - 1;

		for (const tmpFilterGroup of pFilterState.PreparedFilters)
		{
			let tmpCurrentIndex = null;
			for (const tmpFilter of tmpFilterGroup.Filters)
			{
				if (tmpFilter.Index !== tmpCurrentIndex)
				{
					++tmpComputedIndex;
					tmpCurrentIndex = tmpFilter.Index;
				}
				tmpFilter.ComputedIndex = tmpComputedIndex;
			}
			for (const tmpFilter of tmpFilterGroup.Filters)
			{
				if (tmpFilter.ValueTemplate)
				{
					tmpFilter.ValueTemplate = tmpFilter.ValueTemplate.replace(/\[([^\]]+)\]/g, (match) =>
					{
						const tmpLocalIndex = match.substring(5, match.length - 1);
						const tmpGlobalIndex = tmpFilterGroup.Filters.find((f) => f.Index == tmpLocalIndex)?.ComputedIndex;
						if (tmpGlobalIndex == null)
						{
							throw new Error(`Filter index ${tmpLocalIndex} not found in group filters.`);
						}
						return match.replace(tmpLocalIndex, tmpGlobalIndex);
					});
				}
			}
		}
	}

	/**
	 * @param {FilterState} pFilterState
	 */
	compileMeadowFilterStanzas(pFilterState)
	{
		const tmpBundleConfig = [];
		//TODO: mathematically solve the number line
		// planned synthesized syntax for running on the server
		// FBV-3_Author~Name~LK~%25Ann%25~FBL-2_BookAuthorJoin~IDAuthor~INN~{~PJU:,^State[Step-3]^IDAuthor~}~FBV-1~User~NameFirst~LK~%25Bob%25~FBVOR-1~User~NameLast~LK~%25Bob%25~FBV~CreateDate~GT~2023-01-01T00:00:00Z~FBV~CreateDate~LT~2024-01-01T00:00:00Z~FBL~IDBook~INN~{~PJU:,^State[Step-2]^IDBook~}
		if (!pFilterState.Filter)
		{
			pFilterState.Filter = `${pFilterState.Entity || 'Unknown'}-${this.pict.getUUID()}`;
		}
		tmpBundleConfig.push(
		{
			Type: 'SetStateAddress',
			StateAddress: `Bundle[${pFilterState.Filter}]`,
		});
		const tmpGroupedFilters = {};
		const tmpGroupedFilterKeys = [];
		const tmpGroupedCoreFilters = [];
		const tmpGroupedCoreFilterKeys = [];
		let tmpCoreEntity;
		const tmpCoreFilterStrings = [];
		for (const tmpFilterGroup of pFilterState.PreparedFilters)
		{
			for (const tmpFilter of tmpFilterGroup.Filters)
			{
				if (tmpFilter.CoreEntity)
				{
					tmpCoreEntity = tmpFilter.Entity;
					const tmpFilterGUID = `${tmpFilterGroup.GUID}-${tmpFilter.ComputedIndex}`;
					if (!tmpGroupedCoreFilterKeys.find((v) => v == tmpFilterGUID))
					{
						tmpGroupedCoreFilterKeys.push(tmpFilterGUID);
					}
					if (!tmpGroupedCoreFilters[tmpFilterGUID])
					{
						tmpGroupedCoreFilters[tmpFilterGUID] = { Stanzas: [], ComputedIndex: tmpFilter.ComputedIndex, Entity: tmpFilter.Entity, Junction: tmpFilterGroup.Junction || 'AND', GroupOpen: tmpFilterGroup.GroupOpen || false, GroupJunction: tmpFilterGroup.GroupJunction || 'AND', GroupClose: tmpFilterGroup.GroupClose || false };
					}
					tmpGroupedCoreFilters[tmpFilterGUID].Stanzas.push(this._compileSimpleFilterToString(tmpFilter));
				}
				else
				{
					const tmpFilterGroupGUID = `${tmpFilterGroup.GUID}-${tmpFilter.ComputedIndex}`;
					if (!tmpGroupedFilterKeys.find((v) => v == tmpFilterGroupGUID))
					{
						tmpGroupedFilterKeys.push(tmpFilterGroupGUID);
					}
					if (!tmpGroupedFilters[tmpFilterGroupGUID])
					{
						tmpGroupedFilters[tmpFilterGroupGUID] = { Stanzas: [], ComputedIndex: tmpFilter.ComputedIndex, Entity: tmpFilter.Entity };
					}
					tmpGroupedFilters[tmpFilterGroupGUID].Stanzas.push(this._compileSimpleFilterToString(tmpFilter));
				}
			}
			for (const tmpFilterGroupKey of tmpGroupedFilterKeys)
			{
				tmpGroupedFilters[tmpFilterGroupKey].Stanzas = tmpGroupedFilters[tmpFilterGroupKey].Stanzas.filter((f) => f.length > 0);
				if (tmpGroupedFilters[tmpFilterGroupKey].Stanzas.length > 0)
				{
					tmpBundleConfig.push(
						{
							Type: 'MeadowEntity',
							AllRecords: true,
							Entity: tmpGroupedFilters[tmpFilterGroupKey].Entity,
							Filter: tmpGroupedFilters[tmpFilterGroupKey].Stanzas.join('~'),
							Destination: `State[Step${tmpGroupedFilters[tmpFilterGroupKey].ComputedIndex}]`,
						});
				}
			}
		}
		for (const tmpCoreFilterKey of tmpGroupedCoreFilterKeys)
		{
			tmpGroupedCoreFilters[tmpCoreFilterKey].Stanzas = tmpGroupedCoreFilters[tmpCoreFilterKey].Stanzas.filter((f) => f.length > 0);
			if (tmpGroupedCoreFilters[tmpCoreFilterKey].Stanzas.length > 0)
			{
				let stringConstruct = '';
				if (tmpGroupedCoreFilters[tmpCoreFilterKey].GroupOpen)
				{
					stringConstruct += tmpGroupedCoreFilters[tmpCoreFilterKey].GroupJunction == 'OR' ? 'FOPOR~0~(~0~' : 'FOP~0~(~0~';
				}
				stringConstruct += [ tmpGroupedCoreFilters[tmpCoreFilterKey].Junction == 'OR' ? 'FOPOR~0~(~0' : 'FOP~0~(~0', ...tmpGroupedCoreFilters[tmpCoreFilterKey].Stanzas, 'FCP~0~)~0'].join('~');
				if (tmpGroupedCoreFilters[tmpCoreFilterKey].GroupClose)
				{
					stringConstruct += '~FCP~0~)~0'
				}
				tmpCoreFilterStrings.push(stringConstruct);
			}
		}
		if (!tmpCoreEntity)
		{
			tmpCoreEntity = pFilterState.Entity;
		}
		const tmpCoreLoadStep =
		{
			Type: pFilterState.Mode === 'Count' ? 'MeadowEntityCount' : 'MeadowEntity',
			Entity: tmpCoreEntity,
			Filter: tmpCoreFilterStrings.join('~'),
			AllRecords: typeof pFilterState.PageSize === 'undefined',
			RecordStartCursor: pFilterState.RecordOffset,
			Postfix: pFilterState.Postfix || '',
			Scope: pFilterState.Scope || '',
			Projection: pFilterState.Projection,
			PageSize: pFilterState.PageSize,
			Destination: pFilterState.ResultDestinationAddress,
		};
		if (pFilterState.UserFilters.length > 0)
		{
			let tmpAllSorts = '';
			let tmpFilter = '';
			for (const tmpUserFilter of pFilterState.UserFilters)
			{
				let tmpSorts;
				let tmpSanitizedUserFilter = tmpUserFilter;
				if (pFilterState.Mode === 'Count')
				{
					tmpSanitizedUserFilter = this._sanitizeFilterForCount(tmpUserFilter);
				}
				else
				{
					[ tmpSanitizedUserFilter, tmpSorts ] = this._extractSortsFromFilter(tmpUserFilter);
					if (tmpSorts)
					{
						if (tmpAllSorts.length > 0)
						{
							tmpAllSorts += '~';
						}
						tmpAllSorts += tmpSorts;
					}
					if (!tmpSanitizedUserFilter)
					{
						continue;
					}
				}
				if (!tmpSanitizedUserFilter)
				{
					continue;
				}
				if (tmpFilter.length > 0)
				{
					tmpFilter += '~';
				}
				tmpFilter += 'FOP~0~(~0~';
				tmpFilter += tmpSanitizedUserFilter;
				tmpFilter += '~FCP~0~)~0';
			}
			if (tmpCoreLoadStep.Filter)
			{
				if (tmpFilter.length > 0)
				{
					tmpFilter += '~';
				}
				tmpFilter += 'FOP~0~(~0~';
				tmpFilter += tmpCoreLoadStep.Filter;
				tmpFilter += '~FCP~0~)~0';
			}
			if (tmpAllSorts)
			{
				if (tmpFilter.length > 0)
				{
					tmpFilter += '~';
				}
				tmpFilter += tmpAllSorts;
			}
			tmpCoreLoadStep.Filter = tmpFilter;
		}
		tmpBundleConfig.push(tmpCoreLoadStep);
		pFilterState.BundleConfig = tmpBundleConfig;
	}

	/**
	 * @param {string} pFilter
	 *
	 * @return {string}
	 */
	_sanitizeFilterForCount(pFilter)
	{
		if (!pFilter || typeof pFilter !== 'string')
		{
			return pFilter;
		}

		let tmpMicroStanzas = pFilter.split('~');
		for (let i = 0; i < tmpMicroStanzas.length; i += 4)
		{
			if (tmpMicroStanzas[i] === 'FSF')
			{
				tmpMicroStanzas = tmpMicroStanzas.slice(0, i).concat(tmpMicroStanzas.slice(i + 4));
				i -= 4; // adjust for removed elements
			}
		}
		return tmpMicroStanzas.join('~');
	}

	/**
	 * @param {string} pFilter
	 *
	 * @return {Array<string>}
	 */
	_extractSortsFromFilter(pFilter)
	{
		if (!pFilter || typeof pFilter !== 'string')
		{
			return [ pFilter, '' ];
		}

		let tmpSortStanzas = [];
		let tmpMicroStanzas = pFilter.split('~');
		for (let i = 0; i < tmpMicroStanzas.length; i += 4)
		{
			if (tmpMicroStanzas[i] === 'FSF')
			{
				tmpSortStanzas.push(tmpMicroStanzas.slice(i, i + 4).join('~'));
				tmpMicroStanzas = tmpMicroStanzas.slice(0, i).concat(tmpMicroStanzas.slice(i + 4));
				i -= 4; // adjust for removed elements
			}
		}
		return [ tmpMicroStanzas.join('~'), tmpSortStanzas.join('~') ];
	}

	_compileSimpleFilterToString(pFilter)
	{
		let tmpFilterString = `${pFilter.Instruction}`;
		tmpFilterString += `~${pFilter.Field}`;
		tmpFilterString += `~${pFilter.Operator}`;
		if (pFilter.ValueTemplate)
		{
			tmpFilterString += `~${pFilter.ValueTemplate}`;
		}
		else
		{
			tmpFilterString += `~${pFilter.Value || ''}`;
		}
		if (pFilter.OpenParen)
		{
			tmpFilterString = `${ pFilter.OpenParenOr ? 'FOPOR' : 'FOP' }~0~(~0~${tmpFilterString}`;
		}
		if (pFilter.CloseParen)
		{
			tmpFilterString = `${tmpFilterString}~FCP~0~)~0`;
		}
		return tmpFilterString;
	}
}

module.exports = FilterMeadowStanzaTokenGenerator;
