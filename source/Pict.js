/**
 * @author <steven@velozo.com>
 */
const libFableServiceTransactionTracking = require(`./services/Fable-Service-TransactionTracking.js`);

/**
 * @typedef {{
 *    UUID: string,
 *    settings: any,
 *    fable: Fable,
 *    servicesMap: any,
 *    addAndInstantiateServiceType: (hash: string, prototype: any) => any,
 *    addServiceTypeIfNotExists: (hash: string, prototype: any) => any,
 *    addServiceType: (hash: string, prototype: any) => any,
 *    instantiateServiceProvider: (hash: string, options?: any, prototype?: any) => any,
 *    instantiateServiceProviderWithoutRegistration: (hash: string) => any,
 *    instantiateServiceProviderFromPrototype: (pServiceType: string, pOptions?: any, pCustomServiceHash?: string, pServicePrototype?: any) => any,
 *    getUUID: () => string,
 *    Utility:
 *    {
 *				extend: (pObject: any, ...pExtension: any[]) => any,
 *				eachLimit: (pArray: any[], pLimit: number, pIterator: (pRecord: any, fRecordCallback: () => void) => void, fCallback: (pError: any) => void) => void,
 *    },
 *    MetaTemplate: any,
 * }} Fable
 */
/** @type {{ new(...args: any[]): Fable }} */
const libFable = require('fable');

const libPackage = require('../package.json');
const libProviderFilterManager = require('./providers/Provider-Filter-Manager.js');
const libProviderDataBroker = require('./providers/Provider-DataBroker.js');
const libProviderIcon = require('./providers/Provider-Icon.js');

const PictTemplateProvider = require('./Pict-Template-Provider.js');
const PictTemplateAudit = require('./Pict-Template-Audit.js');
const PictContentAssignment = require('./Pict-Content-Assignment.js');
const PictDataProvider = require('./Pict-DataProvider.js');
const PictCSS = require('./Pict-CSS.js');
const PictMeadowEntityProvider = require('./Pict-Meadow-EntityProvider.js');

/**
 * Pict management object.
 */
class Pict extends libFable {
	/**
	 * @param {Object<String, any>} pSettings - The settings for the Pict instance.
	 */
	constructor(pSettings) {
		super(pSettings);

		/** @type {any} */
		this.settings;
		/** @type {Record<string, any>} */
		this.services;
		/** @type {Record<string, any>} */
		this.servicesMap;

		this.isBrowser = new Function(
			"try {return (this===window);} catch(pError) {return false;}",
		);

		/** @type {Object} */
		this._PackageFable = this._Package;
		/** @type {Record<string, any>} */
		this._Package = libPackage;

		this.browserAddress = "window._Pict";
		if ("BrowserAddress" in this.settings) {
			this.browserAddress = this.settings.BrowserAddress;
		}
		this.children = [];

		/** @type {import('pict-application')} */
		this.PictApplication = null;
		// shim types from fable until we export types properly
		/** @type {any} */
		this.log;
		//NOTE: This needs to come before any other providers which may instantiate a rest client so we don't proliferate them
		this.instantiateServiceProvider("RestClient");
		/**
		 * The templateProvider provides a basic key->template mapping with default fallback capabilities
		 *
		 * @type {PictTemplateProvider}
		 */
		this.TemplateProvider = null;
		this.addAndInstantiateServiceType("TemplateProvider", PictTemplateProvider);
		/**
		 * The template audit provider.
		 *
		 * @type {PictTemplateAudit}
		 */
		this.TemplateAudit = null;
		this.addAndInstantiateServiceType("TemplateAudit", PictTemplateAudit);
		/**
		 * The meadow entity provider.
		 *
		 * @type {PictMeadowEntityProvider}
		 */
		this.EntityProvider = null;
		this.addAndInstantiateServiceType(
			"EntityProvider",
			PictMeadowEntityProvider,
		);
		/**
		 * The data provider.
		 *
		 * @type {PictDataProvider}
		 */
		this.DataProvider = null;
		this.addAndInstantiateServiceType("DataProvider", PictDataProvider);

		this.addServiceTypeIfNotExists('TransactionTracking', libFableServiceTransactionTracking);
		/**
		 * The content assignment module.
		 *
		 * @type {PictContentAssignment}
		 */
		this.ContentAssignment = null;
		this.expressionParser = this.instantiateServiceProvider("ExpressionParser");
		this.addAndInstantiateServiceType(
			"ContentAssignment",
			PictContentAssignment,
		);
		/**
		 * The CSS module.
		 *
		 * @type {PictCSS}
		 * @public
		 */
		this.CSSMap = null;
		this.addAndInstantiateServiceType("CSSMap", PictCSS);

		this.addServiceType("PictTemplate", require("pict-template"));
		this.instantiateServiceProvider("MetaTemplate");
		this.instantiateServiceProvider("DataGeneration");

		this.manifest = this.instantiateServiceProvider("Manifest");

		/** @type {Record<string, any>} */
		this.AppData = {};
		if ("DefaultAppData" in this.fable.settings)
		{
			this.AppData = this.fable.settings.DefaultAppData;
		}

		/** @type {Record<string, any>} */
		// Added for transitory data like chart data caches
		this.TempData = {};

		/** @type {Record<string, any>} */
		this.Bundle = {};
		if ("DefaultBundle" in this.fable.settings)
		{
			this.Bundle = this.fable.settings.DefaultBundle;
		}

		// Log noisness goes from 0 - 5, where 5 is show me everything.
		this.LogNoisiness = 0;
		// Although we have log noisiness, sometimes we need control flow without all the other noise for hard to diagnose interpreters.
		this.LogControlFlow = false;
		// And an easy way to be introspective about data at various locations
		this.LogControlFlowWatchAddressList = [];

		// Template auditing -- when enabled, builds a tree of template processing info
		this.TemplateDebug = false;
		// Secondary flag to capture real Error().stack traces (expensive, off by default)
		this.TemplateDebugStack = false;

		// Load manifest sets
		if (this.settings.Manifests) {
			this.loadManifestSet(this.settings.Manifests);
		}

		this._DefaultPictTemplatesInitialized = false;
		this.initializePictTemplateEngine();

		this.addServiceType("PictView", require("pict-view"));
		this.addServiceType("PictProvider", require("pict-provider"));
		this.addServiceType("PictApplication", require("pict-application"));

		// Expose the named views directly, through a convenience accessor
		/** @type {{ FilterManager: libProviderFilterManager, [key: string]: any }} */
		this.providers = this.servicesMap.PictProvider;
		this.views = this.servicesMap.PictView;

		this.addProvider('FilterManager', {}, libProviderFilterManager);
		this.addProvider('DataBroker', {}, libProviderDataBroker);
		this.addProvider('Icon', {}, libProviderIcon);
	}

	/**
	 * Convenience accessor for the built-in icon registry — equivalent to
	 * `pict.providers.Icon.get(name, opts)`.  Always returns a string
	 * (never throws, never undefined); a missing icon emits a visible
	 * question-mark glyph so the gap is obvious in the UI.
	 *
	 * @param {string} pName     PascalCase icon name, or an alias.
	 * @param {object} [pOpts]   { variant, size, class, ariaLabel }
	 * @returns {string}
	 */
	icon(pName, pOpts)
	{
		if (!this.providers || !this.providers.Icon)
		{
			return '';
		}
		return this.providers.Icon.get(pName, pOpts);
	}

	/**
	 * Load manifests in as Hashed services
	 *
	 * @param {Object<String, String>} pManifestSet - The manifest set to load.
	 */
	loadManifestSet(pManifestSet) {
		if (typeof pManifestSet != "object") {
			this.log.warn(
				`PICT [${this.UUID}] could not load Manifest Set; pManifestSet was not an object.`,
			);
			return;
		}
		let tmpManifestKeys = Object.keys(pManifestSet);
		if (tmpManifestKeys.length > 0) {
			for (let i = 0; i < tmpManifestKeys.length; i++) {
				// Load each manifest
				let tmpManifestKey = tmpManifestKeys[i];
				this.instantiateServiceProvider(
					"Manifest",
					pManifestSet[tmpManifestKey],
					tmpManifestKey,
				);
			}
		}
	}

	/**
	 * Add a template expression to the template engine from the PictTemplate service.
	 *
	 * @template {new (...args: any[]) => any} T
	 * @param {T} pTemplatePrototype - The prototype class for the template expression
	 *
	 * @return {InstanceType<T>} the service instance, or null if the prototype was invalid
	 */
	addTemplate(pTemplatePrototype) {
		if (typeof pTemplatePrototype != "function") {
			this.log.warn(
				`PICT [${this.UUID}] could not add Template; pTemplatePrototype was not a class it was ${typeof pTemplatePrototype}.`,
			);
			return null;
		}

		let tmpTemplateHash = pTemplatePrototype["template_hash"];

		if (this.LogNoisiness > 1) {
			this.log.info(`PICT-ControlFlow addTemplate [${tmpTemplateHash}]`);
		}

		return this.instantiateServiceProviderFromPrototype(
			"PictTemplate",
			{},
			tmpTemplateHash,
			pTemplatePrototype,
		);
	}

	/**
	 * Just passing an options will construct one for us.
	 * Passing a hash will set the hash.
	 * Passing a prototype will use that!
	 *
	 * @template {new (...args: any[]) => any} [T=typeof import('pict-view')]
	 * @param {String} pViewHash - The hash of the view.
	 * @param {Object<String, any>} [pOptions] - The options for the view.
	 * @param {T} [pViewPrototype] - The prototype for the view.
	 *
	 * @return {InstanceType<T>} The view instance.
	 */
	addView(pViewHash, pOptions, pViewPrototype) {
		let tmpOptions = typeof pOptions == "object" ? pOptions : {};
		let tmpViewHash =
			typeof pViewHash == "string" ? pViewHash : this.fable.getUUID();
		// This is here to change how the value is managed by webpack
		let tmpViewPrototype = pViewPrototype;

		if (this.LogControlFlow) {
			if (this.LogNoisiness > 1) {
				this.log.info(`PICT-ControlFlow addView [${tmpViewHash}]:`, {
					Options: tmpOptions,
				});
			} else {
				this.log.info(`PICT-ControlFlow addView [${tmpViewHash}]`);
			}
		}

		if (tmpViewPrototype) {
			// If the prototype has a default_configuration, it will be merged with options.
			const tmpDefaultViewConfiguration =
				tmpViewPrototype["default_configuration"];
			if (tmpDefaultViewConfiguration) {
				tmpOptions = this.fable.Utility.extend(
					{},
					JSON.parse(JSON.stringify(tmpDefaultViewConfiguration)),
					tmpOptions,
				);
			}
			return this.instantiateServiceProviderFromPrototype(
				"PictView",
				tmpOptions,
				tmpViewHash,
				tmpViewPrototype,
			);
		} else {
			return this.instantiateServiceProvider(
				"PictView",
				tmpOptions,
				tmpViewHash,
			);
		}
	}

	/**
	 * Add a view unless one already exists, then return that one.
	 * Just passing an options will construct one for us.
	 * Passing a hash will set the hash.
	 * Passing a prototype will use that!
	 *
	 * @param {String} pViewHash - The hash of the view.
	 * @param {Object<String, any>} [pOptions] - The options for the view.
	 * @param {any} [pViewPrototype] - The prototype for the view.
	 * @return {any} The view instance.
	 */
	addViewSingleton(pViewHash, pOptions, pViewPrototype)
	{
		if (pViewHash in this.views)
		{
			return this.views[pViewHash];
		}
		return this.addView(pViewHash, pOptions, pViewPrototype);
	}

	/**
	 * Add a provider unless one already exists, then return that one.
	 *
	 * Just passing an options will construct one for us.
	 * Passing a hash will set the hash.
	 * Passing a prototype will use that!
	 *
	 * @param {String} pProviderHash - The hash of the provider.
	 * @param {Object<String, any>} [pOptions] - The options for the provider.
	 * @param {any} [pProviderPrototype] - The prototype for the provider.
	 *
	 * FIXME: refer to PictProvider here once it has a type definition
	 *
	 * @return {any} The provider instance.
	 */
	addProviderSingleton(pProviderHash, pOptions, pProviderPrototype) {
		if (pProviderHash in this.providers) {
			return this.providers[pProviderHash];
		}
		return this.addProvider(pProviderHash, pOptions, pProviderPrototype);
	}

	/**
	 * @return {libFableServiceTransactionTracking}
	 */
	newTransactionTracker()
	{
		return this.instantiateServiceProviderWithoutRegistration('TransactionTracking');
	}

	/**
	 * Add an Expression Parser function to the solver.
	 *
	 * @param {Object} pExpressionParser - The expresssion parser to add the function to
	 * @param {string} pFunctionName - The name of the function
	 * @param {string} pFunctionAddress - The address of the function
	 * @param {string} pFunctionComment - A comment about the function
	 */
	addSolverFunction(pExpressionParser, pFunctionName, pFunctionAddress, pFunctionComment)
	{
		let tmpFunctionName = (pFunctionName || '').trim().toLowerCase();
		let tmpExpressionParser = pExpressionParser;
		if (!tmpExpressionParser || typeof(tmpExpressionParser) !== 'object' || !tmpExpressionParser.functionMap)
		{
			tmpExpressionParser = this.expressionParser;
		}
		if (tmpExpressionParser.functionMap.hasOwnProperty(tmpFunctionName))
		{
			this.log.warn(`Pict: Function ${tmpFunctionName} already exists in the solver, overwriting with address [${pFunctionAddress}].`);
			//return false;
		}
		tmpExpressionParser.functionMap[tmpFunctionName] = (
		{
			Name: pFunctionComment || `Autogenerated PICT function ${tmpFunctionName}`,
			Address: pFunctionAddress,
		});

		return tmpExpressionParser.functionMap[tmpFunctionName];
	}

	/**
	 * Just passing an options will construct one for us.
	 * Passing a hash will set the hash.
	 * Passing a prototype will use that!
	 *
	 * @param {String} pProviderHash - The hash of the provider.
	 * @param {Object<String, any>} [pOptions] - The options for the provider.
	 * @param {any} [pProviderPrototype] - The prototype for the provider.
	 *
	 * FIXME: refer to PictProvider here once it has a type definition
	 *
	 * @return {any} The provider instance.
	 */
	addProvider(pProviderHash, pOptions, pProviderPrototype) {
		let tmpOptions = typeof pOptions == "object" ? pOptions : {};
		let tmpProviderHash =
			typeof pProviderHash == "string" ? pProviderHash : this.fable.getUUID();

		if (this.LogControlFlow) {
			if (this.LogNoisiness > 1) {
				this.log.info(`PICT-ControlFlow addProvider [${tmpProviderHash}]:`, {
					Options: tmpOptions,
				});
			} else {
				this.log.info(`PICT-ControlFlow addProvider [${tmpProviderHash}]`);
			}
		}

		if (typeof pProviderPrototype != "undefined") {
			// If the prototype has a default_configuration, it will be merged with options.
			if ("default_configuration" in pProviderPrototype) {
				tmpOptions = this.fable.Utility.extend(
					{},
					pProviderPrototype.default_configuration,
					tmpOptions,
				);
			}
			return this.instantiateServiceProviderFromPrototype(
				"PictProvider",
				tmpOptions,
				tmpProviderHash,
				pProviderPrototype,
			);
		} else {
			return this.instantiateServiceProvider(
				"PictProvider",
				tmpOptions,
				tmpProviderHash,
			);
		}
	}

	/**
	 * Just passing an options will construct one for us.
	 * Passing a hash will set the hash.
	 * Passing a prototype will use that!
	 *
	 * @param {String} pApplicationHash - The hash of the application.
	 * @param {Object} [pOptions] - The options for the application.
	 * @param {any} [pApplicationPrototype] - The prototype for the application.
	 *
	 * FIXME: refer to PictApplication here once it has a type definition
	 *
	 * @return {any} The application instance.
	 */
	addApplication(pApplicationHash, pOptions, pApplicationPrototype) {
		let tmpOptions = typeof pOptions == "object" ? pOptions : {};
		let tmpApplicationHash =
			typeof pApplicationHash == "string"
				? pApplicationHash
				: this.fable.getUUID();

		if (this.LogControlFlow) {
			if (this.LogNoisiness > 1) {
				this.log.info(
					`PICT-ControlFlow addApplication [${tmpApplicationHash}]:`,
					{ Options: tmpOptions },
				);
			} else {
				this.log.info(
					`PICT-ControlFlow addApplication [${tmpApplicationHash}]`,
				);
			}
		}

		if (typeof pApplicationPrototype != "undefined") {
			// If the prototype has a default_configuration, it will be merged with options.
			if ("default_configuration" in pApplicationPrototype) {
				tmpOptions = this.fable.Utility.extend(
					{},
					pApplicationPrototype.default_configuration,
					tmpOptions,
				);
			}

			return this.instantiateServiceProviderFromPrototype(
				"PictApplication",
				tmpOptions,
				tmpApplicationHash,
				pApplicationPrototype,
			);
		} else {
			return this.instantiateServiceProvider(
				"PictApplication",
				tmpOptions,
				tmpApplicationHash,
			);
		}
	}

	/**
	 * Attach the default template engine renderers.
	 *
	 * TODO: Move this to a one-time service
	 *
	 * @private
	 */
	initializePictTemplateEngine() {
		if (!this._DefaultPictTemplatesInitialized) {
			// Just looking up data in the application state template expression
			//{~Data:AppData.Some.Value.to.Render~}
			//{~D:AppData.Some.Value.to.Render~}
			this.addTemplate(require(`./templates/Pict-Template-Data.js`));

			this.addTemplate(require(`./templates/Pict-Template-DataWithTemplateFallback.js`));

			this.addTemplate(require(`./templates/Pict-Template-DataWithAbsoluteFallback.js`));

			this.addTemplate(require(`./templates/Pict-Template-TemplateByReference.js`));

			this.addTemplate(require(`./templates/Pict-Template-TemplateFromAddress.js`));

			this.addTemplate(require(`./templates/Pict-Template-TemplateByTypes.js`));

			this.addTemplate(require(`./templates/Pict-Template-DataValueByKey.js`));

			this.addTemplate(require(`./templates/Pict-Template-View.js`));

			this.addTemplate(require(`./templates/data/Pict-Template-DataEncodeJavascriptString.js`));

			// HTML Comment Start and End based on truthiness ... if the value is false, the comment shows up.
			// {~HtmlCommentStart:Some.Address~} gives you "<!--"
			// {~HCS:Some.Address~} gives you "<!--"
			this.addTemplate(
				require(`./templates/data/Pict-Template-HtmlCommentStart.js`),
			);
			// {~HtmlCommentEnd:Some.Address~} gives you "-->"
			// {~HCE:Some.Address~} gives you "-->"
			this.addTemplate(
				require(`./templates/data/Pict-Template-HtmlCommentEnd.js`),
			);

			// Know the in-browser reference for Pict when appropriate
			this.addTemplate(require(`./templates/Pict-Template-Self.js`));

			// Built-in icon glyph by PascalCase name.
			//   {~Icon:Home~}              default variant
			//   {~Icon:Folder:Filled~}     explicit variant
			//   {~I:Spreadsheet~}          short alias
			//   {~I:File:Filled~}          short + variant
			// Backed by pict.providers.Icon — host modules register
			// additional glyphs via pict.providers.Icon.registerSet().
			this.addTemplate(require(`./templates/Pict-Template-Icon.js`));

			// Look up an entity template expression
			// {~Entity:Book^AppData.Some.Address.IDBook^Render-Book-Template~}
			// {~E:Book^AppData.Some.Address.IDBook^Render-Book-Template~}
			// ...meaning GET BOOK with IDBook FROM AppData.Some.Address.IDBook and render it to Render-Book-Template
			this.addTemplate(require(`./templates/Pict-Template-Entity.js`));

			// Child Template Expressions
			// {~T:Template:AddressOfData~}
			this.addTemplate(require(`./templates/Pict-Template-Template.js`));
			this.addTemplate(require(`./templates/Pict-Template-TemplateByDataAddress.js`));
			// Inline Template Expression -- parse the contents as a template at runtime
			// {<TEMPLATED CONTENT HERE, {~D:AppData.SomeValue~}.>}
			this.addTemplate(require(`./templates/Pict-Template-InlineTemplate.js`));
			// Function Expression -- call a function by address with addressed arguments
			// {~Function:Pict.providers.X.makeThing:Record.X:Record.Y~}  /  {~F:...~}
			this.addTemplate(require(`./templates/Pict-Template-Function.js`));
			// Addressed Template Expression -- resolve an address to a template string and render it
			// {[AppData.MyTemplate]}
			this.addTemplate(require(`./templates/Pict-Template-AddressedTemplate.js`));
			// {~SBR:AppData.Equation:AppData.HomeworkRectangleSize:AppData.HomeworkManifest~}
			this.addTemplate(require(`./templates/Pict-Template-SolveByReference.js`));
			this.addTemplate(require(`./templates/Pict-Template-Solve.js`));
			// {~TS:Template:AddressOfDataSet~}
			this.addTemplate(require(`./templates/Pict-Template-TemplateSet.js`));
			// {~TVS:Template:AddressOfDataSet~}
			this.addTemplate(
				require(`./templates/Pict-Template-TemplateValueSet.js`),
			);
			this.addTemplate(
				require(`./templates/Pict-Template-TemplateSetWithPayload.js`),
			);
			this.addTemplate(require(`./templates/Pict-Template-TemplateFromMap.js`));
			this.addTemplate(
				require(`./templates/Pict-Template-TemplateSetFromMap.js`),
			);

			// Logical Branching Template Expressions
			// {~TemplateIf:Template:AddressOfData:AppData.Some.Address.IDBook^OPERATOR^AppData.Some.Address2.IDBook~}
			// {~TIf:Template:AddressOfData:AppData.Some.Address.IDBook^OPERATOR^AppData.Some.Address2.IDBook~}
			this.addTemplate(
				require(`./templates/logic/Pict-Template-TemplateIf.js`),
			);
			// {~TemplateIfAbsolute:Template:AddressOfData:AppData.Some.Address.IDBook^OPERATOR^Absolute_Value~}
			// {~TIfAbs:Template:AddressOfData:AppData.Some.Address.IDBook^OPERATOR^Absolute_Value~}
			this.addTemplate(
				require(`./templates/logic/Pict-Template-TemplateIfAbsolute.js`),
			);
			// {~NotEmpty:AppData.Some.Address^Absolute Value~}
			this.addTemplate(require(`./templates/logic/Pict-Template-NotEmpty.js`));

			// Data Manipulation Templates
			this.addTemplate(require(`./templates/data/Pict-Template-DataJson.js`));
			this.addTemplate(
				require(`./templates/data/Pict-Template-PascalCaseIdentifier.js`),
			);
			this.addTemplate(
				require(`./templates/data/Pict-Template-DateOnlyFormat.js`),
			);
			this.addTemplate(
				require(`./templates/data/Pict-Template-DateOnlyYMD.js`),
			);
			this.addTemplate(
				require(`./templates/data/Pict-Template-DateTimeFormat.js`),
			);
			this.addTemplate(
				require(`./templates/data/Pict-Template-DateTimeYMD.js`),
			);
			this.addTemplate(require(`./templates/data/Pict-Template-Digits.js`));
			this.addTemplate(require(`./templates/data/Pict-Template-Dollars.js`));

			this.addTemplate(require(`./templates/data/Pict-Template-Join.js`));
			this.addTemplate(require(`./templates/data/Pict-Template-JoinUnique.js`));
			this.addTemplate(
				require(`./templates/data/Pict-Template-PluckJoinUnique.js`),
			);

			// Data Generation Templates
			this.addTemplate(
				require(`./templates/data-generation/Pict-Template-RandomNumber.js`),
			);
			this.addTemplate(
				require(
					`./templates/data-generation/Pict-Template-RandomNumberString.js`,
				),
			);

			// Debugging Templates
			this.addTemplate(
				require(`./templates/debugging/Pict-Template-Breakpoint.js`),
			);
			this.addTemplate(
				require(`./templates/debugging/Pict-Template-LogStatement.js`),
			);
			this.addTemplate(
				require(`./templates/debugging/Pict-Template-LogValue.js`),
			);
			this.addTemplate(
				require(`./templates/debugging/Pict-Template-LogValueTree.js`),
			);
			this.addTemplate(
				require(`./templates/debugging/Pict-Template-DataValueTree.js`),
			);

			this._DefaultPictTemplatesInitialized = true;
		}
	}

	/**
	 * Read a value from a nested object using a dot notation string.
	 *
	 * TODO: re-home this in the data broker
	 *
	 * @param {string} pAddress - The address to resolve
	 * @param {Record<string, any>} [pRecord] - The record to resolve
	 * @param {Array<any>} [pContextArray] - The context array to resolve (optional)
	 * @param {Record<string, any>} [pRootDataObject] - The root data object to resolve (optional)
	 * @param {any} [pScope] - A sticky scope that can be used to carry state and simplify template
	 * @param {any} [pState] - A catchall state object for plumbing data through template processing.
	 *
	 * @return {any} The value at the given address, or undefined
	 */
	resolveStateFromAddress(pAddress, pRecord, pContextArray, pRootDataObject, pScope, pState)
	{
		let tmpContextArray = (Array.isArray(pContextArray)) ? pContextArray : [ this ];
		let tmpScope = pScope || this;
		let tmpRootDataObject = typeof(pRootDataObject) === 'object' && pRootDataObject != null ? pRootDataObject : {};

		tmpRootDataObject.Fable = this;
		tmpRootDataObject.Pict = this;
		tmpRootDataObject.AppData = this.AppData;
		tmpRootDataObject.TempData = this.TempData;
		tmpRootDataObject.Bundle = this.Bundle;
		tmpRootDataObject.Context = tmpContextArray;
		tmpRootDataObject.Record = pRecord;
		tmpRootDataObject.Scope = tmpScope;
		tmpRootDataObject.__State = pState;

		return this.manifest.getValueByHash(tmpRootDataObject, pAddress);
	}

	/**
	 * Set a value from a nested object using a dot notation string.
	 *
	 * TODO: re-home this in the data broker
	 *
	 * @param {string} pAddress - The address to resolve
	 * @param {any} pRecord - The record to resolve
	 * @param {any} pValue - The value to set at the given address
	 * @param {Array<any>} [pContextArray] - The context array to resolve
	 * @param {any} [pScope] - A sticky scope that can be used to carry state and simplify template
	 *
	 * @return {any} The value at the given address, or undefined
	 */
	setStateValueAtAddress(pAddress, pRecord, pValue, pContextArray, pScope)
	{
		let tmpContextArray = (Array.isArray(pContextArray)) ? pContextArray : [ this ];
		let tmpScope = pScope || this;
		const tmpAddressSpace =
		{
			Fable: this.fable,
			Pict: this,
			AppData: this.AppData,
			TempData: this.TempData,
			Bundle: this.Bundle,
			Context: tmpContextArray,
			Record: pRecord,
			Scope: tmpScope,
		};
		return this.manifest.setValueByHash(tmpAddressSpace, pAddress, pValue);
	}

	/**
	 * Parse a template.
	 *
	 * @param {String} pTemplateString - The template string to parse
	 * @param {Object} pData - The data to use in the template
	 * @param {Function} [fCallback] - The callback to call when the template is parsed
	 * @param {Array<any>} [pContextArray] - The context array to use in the template
	 * @param {any} [pScope] - A sticky scope that can be used to carry state and simplify template
	 * @param {any} [pState] - A catchall state object for plumbing data through template processing.
	 *
	 * @return {String?} The parsed template string, or undefined if a callback was provided
	 */
	parseTemplate(pTemplateString, pData, fCallback, pContextArray, pScope, pState)
	{
		let tmpData = typeof pData === "object" ? pData : {};
		let tmpContextArray = Array.isArray(pContextArray) ? pContextArray : [ this ];
		let tmpScope = pScope || this;
		let tmpParseUUID;
		if (this.LogControlFlow) {
			tmpParseUUID = this.fable.getUUID();
			this.log.info(
				`PICT-ControlFlow parseTemplate ${tmpParseUUID} [${pTemplateString.substring(0, 50).replace("\n", "\\n")}...${pTemplateString.length}] (fCallback: ${typeof fCallback}) with data size [${JSON.stringify(tmpData).length}]`,
			);
			if (this.LogNoisiness > 1) {
				this.log.info(
					`PICT-ControlFlow parseTemplate ${tmpParseUUID} template:\n${pTemplateString}`,
				);
			}
			if (this.LogControlFlowWatchAddressList.length > 0) {
				for (let i = 0; i < this.LogControlFlowWatchAddressList.length; i++) {
					this.log.info(
						`PICT-ControlFlow parseTemplate ${tmpParseUUID} Watch Value: [${this.LogControlFlowWatchAddressList[i]}]=>[${this.resolveStateFromAddress(this.LogControlFlowWatchAddressList[i], tmpData)}]`,
					);
				}
			}
		}

		if (typeof fCallback === "function") {
			this.MetaTemplate.parseString(
				pTemplateString,
				tmpData,
				(pError, pParsedTemplate) => {
					if (this.LogControlFlow && this.LogNoisiness > 1) {
						this.log.info(
							`PICT-ControlFlow parseTemplate ${tmpParseUUID} Template Async Return Value:\n${pParsedTemplate}`,
						);
					}
					return fCallback(pError, pParsedTemplate);
				},
				tmpContextArray,
				tmpScope,
				pState,
			);
		} else {
			let tmpResult = this.MetaTemplate.parseString(
				pTemplateString,
				tmpData,
				null,
				tmpContextArray,
				tmpScope,
				pState,
			);
			if (this.LogControlFlow && this.LogNoisiness > 1) {
				this.log.info(
					`PICT-ControlFlow parseTemplate ${tmpParseUUID} Template Return Value:\n${tmpResult}`,
				);
			}
			return tmpResult;
		}
	}

	/**
	 * Parse a template by hash.
	 *
	 * @param {String} pTemplateHash - The hash of the template to parse
	 * @param {Object} pData - The data to use in the template
	 * @param {Function} [fCallback] - The callback to call when the template is parsed
	 * @param {Array<any>} [pContextArray] - The context array to use in the template
	 * @param {any} [pScope] - A sticky scope that can be used to carry state and simplify template
	 * @param {any} [pState] - A catchall state object for plumbing data through template processing.
	 *
	 * @return {String?} The parsed template string, or undefined if a callback was provided
	 */
	parseTemplateByHash(pTemplateHash, pData, fCallback, pContextArray, pScope, pState)
	{
		let tmpTemplateString = this.TemplateProvider.getTemplate(pTemplateHash);

		// TODO: Unsure if returning empty is always the right behavior -- if it isn't we will use config to set the behavior
		if (!tmpTemplateString) {
			tmpTemplateString = "";
		}

		return this.parseTemplate(
			tmpTemplateString,
			pData,
			fCallback,
			pContextArray,
			pScope,
			pState,
		);
	}

	/**
	 * Parse a template set.
	 *
	 * @param {String} pTemplateString - The template string to parse
	 * @param {Array<any>|Object} pDataSet - The data set to use in the template
	 * @param {Function} [fCallback] - The callback to call when the template set is parsed
	 * @param {Array<any>} [pContextArray] - The context array to use in the template
	 * @param {any} [pScope] - A sticky scope that can be used to carry state and simplify template
	 * @param {any} [pState] - A catchall state object for plumbing data through template processing.
	 *
	 * @return {String?} The parsed template string, or undefined if a callback was provided
	 */
	parseTemplateSet(pTemplateString, pDataSet, fCallback, pContextArray, pScope, pState)
	{
		// TODO: This will need streaming -- for now janky old string append does the trick
		let tmpValue = "";
		if (typeof fCallback == "function") {
			if (Array.isArray(pDataSet) || typeof pDataSet == "object") {
				let tmpIterationCount = 0;
				this.Utility.eachLimit(
					pDataSet,
					1,
					(pRecord, fRecordTemplateCallback) => {
						return this.parseTemplate(
							pTemplateString,
							pRecord,
							(pError, pTemplateResult) => {
								tmpValue += pTemplateResult;
								tmpIterationCount++;
								// Yield to the event loop every 100 iterations to prevent
								// stack overflow on large data sets when templates resolve synchronously
								if (tmpIterationCount % 100 === 0)
								{
									setImmediate(fRecordTemplateCallback);
								}
								else
								{
									fRecordTemplateCallback();
								}
							},
							pContextArray,
							pScope,
							pState,
						);
					},
					(pError) => {
						return fCallback(pError, tmpValue);
					},
				);
			} else {
				return fCallback(
					Error("Pict: Template Set: pDataSet is not an array or object."),
					"",
				);
			}
		} else {
			if (Array.isArray(pDataSet) || typeof pDataSet == "object") {
				if (Array.isArray(pDataSet)) {
					for (let i = 0; i < pDataSet.length; i++) {
						tmpValue += this.parseTemplate(
							pTemplateString,
							pDataSet[i],
							null,
							pContextArray,
							pScope,
							pState,
						);
					}
				} else {
					let tmpKeys = Object.keys(pDataSet);
					for (let i = 0; i < tmpKeys.length; i++) {
						tmpValue += this.parseTemplate(
							pTemplateString,
							pDataSet[tmpKeys[i]],
							null,
							pContextArray,
							pScope,
							pState,
						);
					}
				}

				return tmpValue;
			} else {
				return "";
			}
		}
	}

	/**
	 * Parse a template set by hash.
	 *
	 * @param {String} pTemplateHash - The hash of the template to parse
	 * @param {Array<any>|Object} pDataSet - The data set to use in the template
	 * @param {Function} [fCallback] - The callback to call when the template is parsed
	 * @param {Array<any>} [pContextArray] - The context array to use in the template
	 * @param {any} [pScope] - A sticky scope that can be used to carry state and simplify template
	 * @param {any} [pState] - A catchall state object for plumbing data through template processing.
	 *
	 * @return {String?} The parsed template string, or undefined if a callback was provided
	 */
	parseTemplateSetByHash(pTemplateHash, pDataSet, fCallback, pContextArray, pScope, pState)
	{
		let tmpTemplateString = this.TemplateProvider.getTemplate(pTemplateHash);

		// TODO: Unsure if returning empty is always the right behavior -- if it isn't we will use config to set the behavior
		if (!tmpTemplateString) {
			tmpTemplateString = "";
		}

		return this.parseTemplateSet(
			tmpTemplateString,
			pDataSet,
			fCallback,
			pContextArray,
			pScope,
			pState,
		);
	}


	/**
	 * Parse a template set.
	 *
	 * @param {String} pTemplateString - The template string to parse
	 * @param {Array<any>|Object} pDataSet - The data set to use in the template
	 * @param {Function} [fCallback] - The callback to call when the template set is parsed
	 * @param {Array<any>} [pContextArray] - The context array to use in the template
	 * @param {any} [pScope] - A sticky scope that can be used to carry state and simplify template
	 * @param {any} [pState] - A catchall state object for plumbing data through template processing.
	 *
	 * @return {String?} The parsed template string, or undefined if a callback was provided
	 */
	parseTemplateSetWithPayload(pTemplateString, pDataSet, pPayload, fCallback, pContextArray, pScope, pState)
	{
		// TODO: This will need streaming -- for now janky old string append does the trick
		let tmpValue = "";
		if (typeof fCallback == "function") {
			if (Array.isArray(pDataSet) || typeof pDataSet == "object") {
				let tmpIterationCount = 0;
				this.Utility.eachLimit(
					pDataSet,
					1,
					(pRecord, fRecordTemplateCallback) => {
						return this.parseTemplate(
							pTemplateString,
							{ Data: pRecord, Payload: pPayload },
							(pError, pTemplateResult) => {
								tmpValue += pTemplateResult;
								tmpIterationCount++;
								// Yield to the event loop every 100 iterations to prevent
								// stack overflow on large data sets when templates resolve synchronously
								if (tmpIterationCount % 100 === 0)
								{
									setImmediate(fRecordTemplateCallback);
								}
								else
								{
									fRecordTemplateCallback();
								}
							},
							pContextArray,
							pScope,
							pState,
						);
					},
					(pError) => {
						return fCallback(pError, tmpValue);
					},
				);
			} else {
				return fCallback(
					Error("Pict: Template Set: pDataSet is not an array or object."),
					"",
				);
			}
		} else {
			if (Array.isArray(pDataSet) || typeof pDataSet == "object") {
				if (Array.isArray(pDataSet)) {
					for (let i = 0; i < pDataSet.length; i++) {
						tmpValue += this.parseTemplate(
							pTemplateString,
							{ Data: pDataSet[i], Payload: pPayload },
							null,
							pContextArray,
							pScope,
							pState,
						);
					}
				} else {
					let tmpKeys = Object.keys(pDataSet);
					for (let i = 0; i < tmpKeys.length; i++) {
						tmpValue += this.parseTemplate(
							pTemplateString,
							{ Data: pDataSet[tmpKeys[i]], Payload: pPayload },
							null,
							pContextArray,
							pScope,
							pState,
						);
					}
				}

				return tmpValue;
			} else {
				return "";
			}
		}
	}

	/**
	 * Parse a template set by hash.
	 *
	 * @param {String} pTemplateHash - The hash of the template to parse
	 * @param {Array<any>|Object} pDataSet - The data set to use in the template
	 * @param {Object} pPayload - The payload to use in the template
	 * @param {Function} [fCallback] - The callback to call when the template is parsed
	 * @param {Array<any>} [pContextArray] - The context array to use in the template
	 * @param {any} [pScope] - A sticky scope that can be used to carry state and simplify template
	 * @param {any} [pState] - A catchall state object for plumbing data through template processing.
	 *
	 * @return {String?} The parsed template string, or undefined if a callback was provided
	 */
	parseTemplateSetWithPayloadByHash(pTemplateHash, pDataSet, pPayload, fCallback, pContextArray, pScope, pState)
	{
		let tmpTemplateString = this.TemplateProvider.getTemplate(pTemplateHash);

		// TODO: Unsure if returning empty is always the right behavior -- if it isn't we will use config to set the behavior
		if (!tmpTemplateString) {
			tmpTemplateString = "";
		}

		return this.parseTemplateSetWithPayload(
			tmpTemplateString,
			pDataSet,
			pPayload,
			fCallback,
			pContextArray,
			pScope,
			pState,
		);
	}
}

module.exports = Pict;
module.exports.ServiceProviderBase = require('fable-serviceproviderbase');

module.exports.PictApplicationClass = require("pict-application");

module.exports.PictViewClass = require("pict-view");
module.exports.PictProviderClass = require("pict-provider");
module.exports.PictTemplateClass = require("pict-template");

module.exports.EnvironmentLog = require("./environments/Pict-Environment-Log.js");
module.exports.EnvironmentObject = require("./environments/Pict-Environment-Object.js");
module.exports.FilterClauseBase = require('./filters/FilterClauseBase.js');
module.exports.FilterClauseLocal = require('./filters/FilterClauseLocal.js');
module.exports.FilterClauseInternalJoin = require('./filters/FilterClauseInternalJoin.js');
module.exports.FilterClauseExternalJoin = require('./filters/FilterClauseExternalJoin.js');

// This is to help understand the type of enivironement we're executing in
module.exports.isBrowser = new Function(
	"try {return (this===window);} catch(pError) {return false;}",
);

module.exports.safeOnDocumentReady = require(
	`./Pict-Browser-SafeOnDocumentReady.js`,
);
module.exports.safeLoadPictApplication = require(`./Pict-Browser-SafeLoad.js`);
