export = PictTemplateProviderFunction;
/**
 * Function template expression.
 *
 *   {~Function:Pict.providers.SomeProvider.makeThing:Record.X:Record.Y~}
 *   {~F:Pict.providers.SomeProvider.makeThing:Record.X:Record.Y~}
 *
 * First parameter is the address of a function to call (resolved with
 * `pict.resolveStateFromAddress` against the usual root: Record, AppData,
 * Pict, Bundle, Context, Scope, TempData, __State).  Each subsequent
 * `:`-separated parameter is itself an address whose resolved value is
 * passed as an argument to the function.  Arity is dynamic.
 *
 * Returns whatever the function returns (coerced to '' when null /
 * undefined).  If the address does not resolve to a function, a warning is
 * logged that names the address and the full template expression, and the
 * expression renders as ''.  If the function throws, the error is logged
 * and the expression renders as ''.
 *
 * `this` is bound to the address's parent object so instance methods work
 * naturally:  `Pict.providers.X.go(...)` invokes with `this === Pict.providers.X`.
 */
declare class PictTemplateProviderFunction extends libPictTemplate {
    /**
     * @param {Object} pFable - The Fable Framework instance
     * @param {Object} pOptions - The options for the service
     * @param {String} pServiceHash - The hash of the service
     */
    constructor(pFable: any, pOptions: any, pServiceHash: string);
}
declare namespace PictTemplateProviderFunction {
    export { template_hash };
}
import libPictTemplate = require("pict-template");
declare const template_hash: "Function";
//# sourceMappingURL=Pict-Template-Function.d.ts.map