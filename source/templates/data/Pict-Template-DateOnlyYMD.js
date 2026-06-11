const libPictTemplate = require('pict-template');

class PictTemplateProviderDateOnlyYMD extends libPictTemplate
{
	/**
	 * @param {Object} pFable - The Fable Framework instance
	 * @param {Object} pOptions - The options for the service
	 * @param {String} pServiceHash - The hash of the service
	 */
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, pOptions, pServiceHash);

		/** @type {any} */
		this.options;
		/** @type {any} */
		this.log;

		this.addPattern('{~DateOnlyYMD:', '~}');
	}

	/**
	 * Render a template expression, returning a string with the resulting content.
	 *
	 * @param {string} pTemplateHash - The hash contents of the template (what's between the template start and stop tags)
	 * @param {any} pRecord - The json object to be used as the Record for the template render
	 * @param {Array<any>} pContextArray - An array of context objects accessible from the template; safe to leave empty
	 * @param {any} [pScope] - A sticky scope that can be used to carry state and simplify template
	 * @param {any} [pState] - A catchall state object for plumbing data through template processing.
	 *
	 * @return {string} The rendered template
	 */
	render(pTemplateHash, pRecord, pContextArray, pScope, pState)
	{
		let tmpHash = pTemplateHash.trim();
		let tmpData = (typeof (pRecord) === 'object') ? pRecord : {};
		let tmpDateValue = this.resolveStateFromAddress(tmpHash, tmpData, pContextArray, null, pScope, pState);


		if (this.pict.LogNoisiness > 4)
		{
			this.log.trace(`PICT Template [fDateTimeYMD]::[${tmpHash}] with data:`, tmpData);
		}
		else if (this.pict.LogNoisiness > 3)
		{
			this.log.trace(`PICT Template [fDateTimeYMD]::[${tmpHash}]`);
		}

		// A missing value must render as empty — dayjs.utc(undefined) is NOW,
		// which silently writes today's date into absent date fields.
		if (tmpDateValue === undefined || tmpDateValue === null || tmpDateValue === '')
		{
			return '';
		}

		// Because this is "Date Only", we force the time to be UTC 00:00:00 and go with the date part only.
		let tmpDayJS = this.fable.Dates.dayJS.utc(tmpDateValue);

		if (!tmpDayJS.isValid())
		{
			return '';
		}

		//FIXME: this is kind of wacked out; -62167219200000 is the unix ms timestamp for 0000-01-01 00:00:00 UTC
		//       not even sure showing negative is right; showing the era is probably better (BCE vs CE)
		//const prefix = tmpDayJS.valueOf() < -62167219200000 ? '-' : '';
		const tmpPrefix = '';

		return tmpPrefix + tmpDayJS.format('YYYY-MM-DD');
	}
}

module.exports = PictTemplateProviderDateOnlyYMD;
