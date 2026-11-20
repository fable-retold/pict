/*
	Length comparisons (LNGT / LNLT) against a null value.

	`typeof null === 'object'`, so the object branch of compareValues used to read
	`null.length` and throw. Every caller wraps the comparison in try/catch and renders
	'' on error, so the OUTPUT was right — the template correctly showed nothing — while
	an error was logged for every null value on every render. On a 200-row table with a
	nullable column that is 200 error lines per paint, and it steers authors away from
	LNGT, which is otherwise the correct "does this have content" test (unlike `!=`,
	which is loose inequality and matches undefined and null).
*/

const Chai = require('chai');
const Expect = Chai.expect;

const libTemplateIfBase = require('../source/templates/logic/Pict-Template-TemplateIf-Base.js');

/** compareValues needs no fable services, so exercise it off the prototype. */
const compare = (pLeft, pOperator, pRight) =>
	libTemplateIfBase.prototype.compareValues.call({}, pLeft, pOperator, pRight);

suite('Pict template length comparisons', () =>
{
	suite('LNGT', () =>
	{
		test('a populated string is longer than zero', () =>
		{
			Expect(compare('some notes', 'LNGT', 0)).to.equal(true);
			Expect(compare('some notes', 'LENGTH_GREATER_THAN', 0)).to.equal(true);
		});

		test('an empty string is not', () =>
		{
			Expect(compare('', 'LNGT', 0)).to.equal(false);
		});

		test('null returns false instead of throwing', () =>
		{
			Expect(() => compare(null, 'LNGT', 0)).to.not.throw();
			Expect(compare(null, 'LNGT', 0)).to.equal(false);
		});

		test('undefined returns false', () =>
		{
			Expect(compare(undefined, 'LNGT', 0)).to.equal(false);
		});

		test('arrays still measure by length', () =>
		{
			Expect(compare([ 1, 2 ], 'LNGT', 1)).to.equal(true);
			Expect(compare([], 'LNGT', 0)).to.equal(false);
		});

		test('an object with no length is falsy, not an error', () =>
		{
			Expect(() => compare({ Name: 'x' }, 'LNGT', 0)).to.not.throw();
			Expect(compare({ Name: 'x' }, 'LNGT', 0)).to.equal(false);
		});
	});

	suite('LNLT', () =>
	{
		test('a short string is shorter than the bound', () =>
		{
			Expect(compare('ab', 'LNLT', 5)).to.equal(true);
			Expect(compare('abcdef', 'LNLT', 5)).to.equal(false);
		});

		test('null returns false rather than counting as length zero', () =>
		{
			// Treating null as length 0 would make an absent value satisfy a test the author
			// wrote about real content being short.
			Expect(() => compare(null, 'LNLT', 5)).to.not.throw();
			Expect(compare(null, 'LNLT', 5)).to.equal(false);
		});

		test('arrays still measure by length', () =>
		{
			Expect(compare([ 1 ], 'LNLT', 2)).to.equal(true);
		});
	});

	suite('The contrast that makes LNGT the right tool', () =>
	{
		test('`!=` against an empty string matches undefined and null; LNGT does not', () =>
		{
			// This is why the "is there anything to show" test must be LNGT^0 and never !=^.
			Expect(compare(undefined, '!=', ''), 'undefined != "" is true in JS').to.equal(true);
			Expect(compare(null, '!=', ''), 'null != "" is true in JS').to.equal(true);
			Expect(compare(undefined, 'LNGT', 0)).to.equal(false);
			Expect(compare(null, 'LNGT', 0)).to.equal(false);
		});
	});
});
