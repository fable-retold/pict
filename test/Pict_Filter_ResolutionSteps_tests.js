/*
	Unit tests for the resolution steps the filter compiler emits for join clauses.

	These run the FilterMeadowStanzaTokenGenerator pipeline directly
	(generate → link → normalize → compile) and assert on the compiled
	BundleConfig — no live API server required.
*/

const Chai = require('chai');
const Expect = Chai.expect;

const libPict = require('../source/Pict.js');
const libFilter = require('../source/filters/Filter.js');

suite
(
	'Pict Filter Resolution Step Tests',
	() =>
	{
		/** @type {libPict} */
		let _Pict;

		setup(() =>
		{
			_Pict = new libPict({ Product: 'PictFilterResolutionStepTest' });
		});

		/**
		 * Run the full stanza pipeline for a filter configuration and return the compiled state.
		 *
		 * @param {Array<Record<string, any>>} pFilterConfiguration
		 * @param {string} [pMode] - 'Records' or 'Count'
		 * @return {Record<string, any>}
		 */
		const compile = (pFilterConfiguration, pMode) =>
		{
			const tmpState =
			{
				Entity: 'Review',
				Filter: 'Review-Test',
				ResultDestinationAddress: 'AppData.Test',
				Mode: pMode || 'Records',
				FilterConfiguration: pFilterConfiguration,
			};
			const tmpFilter = new libFilter(_Pict);
			tmpFilter.generateMeadowFilterStanzas(tmpState);
			tmpFilter.linkPreparedFilters(tmpState);
			tmpFilter.normalizeMeadowFilterStanzas(tmpState);
			tmpFilter.compileMeadowFilterStanzas(tmpState);
			return tmpState;
		};

		/**
		 * @param {Record<string, any>} pState
		 * @return {Array<Record<string, any>>} the steps that load a join's keys into State[...]
		 */
		const resolutionSteps = (pState) => pState.BundleConfig.filter((pStep) => typeof pStep.Destination === 'string' && pStep.Destination.startsWith('State['));

		const titleSearchGroup = (pValue) =>
		[
			{ GUIDGroup: 'TitleSearch', Type: 'InternalJoinStringMatch', Values: [ pValue ], RemoteTable: 'Book', ExternalFilterByColumns: [ 'Title' ], JoinExternalConnectionColumn: 'IDBook', JoinInternalConnectionColumn: 'IDBook', Ordinal: 0 },
			{ GUIDGroup: 'TitleSearch', Type: 'StringMatch', ExactMatch: false, Junction: 'OR', FilterByColumn: 'Text', Values: [ pValue ], Ordinal: 1 },
			{ GUIDGroup: 'TitleSearch', Type: 'StringMatch', ExactMatch: false, Junction: 'OR', FilterByColumn: 'Title', Values: [ pValue ], Ordinal: 2 },
		];

		const authorJoin = (pValue) =>
		(
			{
				Type: 'ExternalJoinStringMatch',
				Values: [ pValue ],
				ExternalFilterByColumns: [ 'Name' ],
				CoreConnectionColumn: 'IDBook',
				JoinTable: 'BookAuthorJoin',
				JoinTableExternalConnectionColumn: 'IDAuthor',
				JoinTableCoreConnectionColumn: 'IDBook',
				ExternalFilterByTable: 'Author',
				ExternalFilterByTableConnectionColumn: 'IDAuthor',
			}
		);

		test
		(
			'Each join is resolved by exactly one step when other filter groups follow it',
			function()
			{
				const tmpState = compile(
				[
					...titleSearchGroup('Dune'),
					authorJoin('Herbert'),
					{ Type: 'DateRange', Values: { Start: '2023-01-01T00:00:00Z', End: '2024-01-01T00:00:00Z' }, FilterByColumn: 'CreateDate' },
					{ Type: 'RawFilter', Value: 'FSF~CreateDate~DESC~0' },
				]);
				Expect(tmpState.PreparedFilters.length).to.be.greaterThan(2);
				const tmpDestinations = resolutionSteps(tmpState).map((pStep) => pStep.Destination);
				Expect(tmpDestinations).to.have.length(3);
				Expect(new Set(tmpDestinations).size).to.equal(tmpDestinations.length);
				Expect(resolutionSteps(tmpState).map((pStep) => pStep.Entity)).to.deep.equal([ 'Author', 'BookAuthorJoin', 'Book' ]);
			}
		);

		test
		(
			'Resolution steps come before the core load and before any step that reads them',
			function()
			{
				for (const tmpMode of [ 'Records', 'Count' ])
				{
					const tmpState = compile([ ...titleSearchGroup('Dune'), authorJoin('Herbert'), { Type: 'RawFilter', Value: 'FSF~CreateDate~DESC~0' } ], tmpMode);
					const tmpSteps = tmpState.BundleConfig;
					const tmpCoreLoad = tmpSteps[tmpSteps.length - 1];
					Expect(tmpCoreLoad.Type).to.equal(tmpMode === 'Count' ? 'MeadowEntityCount' : 'MeadowEntity');
					Expect(tmpCoreLoad.Entity).to.equal('Review');
					tmpSteps.forEach((pStep, pIndex) =>
					{
						const tmpReads = String(pStep.Filter || '').match(/State\[Step-?\d+\]/g) || [];
						for (const tmpRead of tmpReads)
						{
							const tmpProducers = tmpSteps.filter((pOther) => pOther.Destination === tmpRead);
							Expect(tmpProducers, `${ tmpMode }: one producer for ${ tmpRead }`).to.have.length(1);
							Expect(tmpSteps.indexOf(tmpProducers[0]), `${ tmpMode }: ${ tmpRead } is loaded before it is read`).to.be.lessThan(pIndex);
						}
					});
				}
			}
		);

		test
		(
			'A single join group compiles one resolution step',
			function()
			{
				const tmpState = compile(titleSearchGroup('Dune'));
				const tmpSteps = resolutionSteps(tmpState);
				Expect(tmpSteps).to.have.length(1);
				Expect(tmpSteps[0].Entity).to.equal('Book');
				Expect(tmpSteps[0].Projection).to.deep.equal({ Mode: 'Distinct', Columns: [ 'IDBook' ] });
			}
		);
	}
);
