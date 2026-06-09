export = PictTemplateProviderAddressedTemplate;
/**
 * Addressed Template expression.
 *
 *   {[AppData.MyTemplate]}
 *
 * Looks up the value at the given address (resolved through the same
 * scope as {~D:~} -- Record, AppData, Pict, Bundle, Context, Scope,
 * TempData, __State) and renders it as a template against the current
 * Record/Context/Scope/State.  Pairs with the inline template `{<...>}`:
 *
 *   {<inline body, parsed at runtime>}
 *   {[AppData.PathToTemplateString]}     <- body is *stored* at the address
 *
 * If the address does not resolve, or resolves to a non-string, a warning
 * is logged that names the address and the full expression, and the
 * expression renders as ''.
 */
declare class PictTemplateProviderAddressedTemplate extends libPictTemplate {
    /**
     * @param {Object} pFable - The Fable Framework instance
     * @param {Object} pOptions - The options for the service
     * @param {String} pServiceHash - The hash of the service
     */
    constructor(pFable: any, pOptions: any, pServiceHash: string);
}
declare namespace PictTemplateProviderAddressedTemplate {
    export { template_hash };
}
import libPictTemplate = require("pict-template");
declare const template_hash: "AddressedTemplate";
//# sourceMappingURL=Pict-Template-AddressedTemplate.d.ts.map