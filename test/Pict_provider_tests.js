/**
* Unit tests for Pict
*
* @license     MIT
*
* @author      Steven Velozo <steven@velozo.com>
*/

const Chai = require("chai");
const Expect = Chai.expect;

const libPict = require('../source/Pict.js');

// Outside and inside the docker container, the port is different.
//const _RetoldTestPort = 60086;
const _RetoldTestPort = 8086;

const _BasicConfigurationProvider = require('./configurations/Pict-Provider-BasicConfigurationOnly.json');

const _MockSettings = (
{
	Product: 'MockPict',
	ProductVersion: '1.0.0',

	PictDefaultURLPrefix: `http://localhost:${_RetoldTestPort}/1.0/`
});

class MockPictProvider extends require('../source/Pict-DataProvider.js')
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, pOptions, pServiceHash);

		this.serviceType = 'MockProvider';
	}

	doSomething(pData)
	{
		this.fable.log.info(`MockProvider did something with ${pData}`);
		return true;
	}
}

suite(
	'Pict Provider Tests',
	function()
	{
		setup(
			function()
			{
			}
		);

		suite(
			'Simple Providers',
			function()
			{
				test(
					'Basic Provider with a list.',
					function(fDone)
					{
						var testPict = new libPict(_MockSettings);

						let tmpEnvironment = new libPict.EnvironmentLog(testPict, {});

                        let tmpProvider = testPict.instantiateServiceProvider('PictProvider', _BasicConfigurationProvider, 'ExampleProvider');

						return fDone();
					}
				);
				test(
					'Singleton providers should only instantiate once..',
					function(fDone)
					{
						var testPict = new libPict(_MockSettings);

						let tmpEnvironment = new libPict.EnvironmentLog(testPict, {});

						Expect(Object.keys(testPict.providers).length).to.equal(3); // default providers (FilterManager, DataBroker, Icon)

						let tmpProvider = testPict.addProviderSingleton('MockPictProvider', {}, MockPictProvider);

						Expect(tmpProvider).to.be.an('object');

                        let tmpProvider2 = testPict.addProviderSingleton('MockPictProvider', {}, MockPictProvider);

						Expect(tmpProvider2.Hash).to.equal(tmpProvider.Hash);

						Expect(Object.keys(testPict.providers).length).to.equal(4); // 3 defaults + the singleton added above

						return fDone();
					}
				);
			}
		);
	}
);
