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

const _MockSettings = (
{
	Product: 'MockPict',
	ProductVersion: '1.0.0',
});

suite(
	'Pict CSS',
	() =>
	{
		setup (() => {});

		suite(
			'Basic CSS merging',
			() =>
			{
				test(
					'Create a bit of CSS.',
					(fDone) =>
					{
						let testPict = new libPict(_MockSettings);
						// Isolate from default-provider CSS (e.g. the Icon provider's base sheet) so this exercises only the fragments under test.
						testPict.CSSMap.inlineCSSMap = {};
						Expect(testPict.CSSMap.generateCSS()).to.be.a('string', 'No CSS should still generate an empty string.');
						Expect(testPict.CSSMap.generateCSS()).to.equal('');
						testPict.CSSMap.addCSS('Test', 'body { bgcolor: #000000; }');
						Expect(testPict.CSSMap.generateCSS()).to.equal('/* Test from Unknown */\nbody { bgcolor: #000000; }\n');
						fDone();
					}
				);
				test(
					'Color from numeric.',
					(fDone) =>
					{
						let testPict = new libPict(_MockSettings);
						Expect(testPict.CSSMap.createCssColorRGBFromNumeric(0.5, 0.5, 0.5)).to.equal('#808080');
						Expect(testPict.CSSMap.createCssColorRGBFromNumeric(1, 0, 0)).to.equal('#ff0000');
						Expect(testPict.CSSMap.createCssColorRGBFromNumeric(0, 1, 0)).to.equal('#00ff00');
						Expect(testPict.CSSMap.createCssColorRGBFromNumeric(0, 0, 1)).to.equal('#0000ff');
						Expect(testPict.CSSMap.createCssColorRGBFromNumeric(255, 255, 255)).to.equal('#ffffff');
						Expect(testPict.CSSMap.createCssColorRGBFromNumeric(300, -20, 128)).to.equal('#ff116d');
						fDone();
					}
				);
				test(
					'Test priority, and, assignment.',
					(fDone) =>
					{
						let testPict = new libPict(_MockSettings);
						// Isolate from default-provider CSS (e.g. the Icon provider's base sheet) so this exercises only the fragments under test.
						testPict.CSSMap.inlineCSSMap = {};
						testPict.CSSMap.addCSS('T1', 'a', 100, 'F1');
						testPict.CSSMap.addCSS('T2', 'b', 100, 'F1');
						testPict.CSSMap.addCSS('E1', 'zzz', 150, 'F1');
						testPict.CSSMap.addCSS('T3', 'c', 100, 'F1');
						testPict.CSSMap.addCSS('T4', 'd', 100, 'F1');
						testPict.CSSMap.addCSS('T1', 'e', 100, 'F1');
						Expect(testPict.CSSMap.generateCSS()).to.equal('/* T1 from F1 */\ne\n/* T2 from F1 */\nb\n/* T3 from F1 */\nc\n/* T4 from F1 */\nd\n/* E1 from F1 */\nzzz\n');
						testPict.CSSMap.injectCSS();
						fDone();
					}
				);
			}
		);
	}
);
