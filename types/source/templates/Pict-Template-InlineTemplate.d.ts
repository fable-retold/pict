export = PictTemplateProviderInlineTemplate;
/**
 * Inline Template expression.
 *
 * Captures its raw contents (verbatim, including any other pict template
 * tags) and processes them as a template at runtime.  At render time the
 * captured string is fed back through `pict.parseTemplate(...)` with the
 * same Record/Context/Scope/State that was active at the outer scope.
 *
 *   {<TEMPLATED CONTENT HERE, {~D:AppData.SomeValue~}.>}
 *
 * Direct nesting of `{<...>}` inside another `{<...>}` is not supported;
 * the first `>}` closes the outer block.  Wrap the inner literal in a
 * registered template hash and reference it with `{~T:Hash~}` for that.
 */
declare class PictTemplateProviderInlineTemplate extends libPictTemplate {
    /**
     * @param {Object} pFable - The Fable Framework instance
     * @param {Object} pOptions - The options for the service
     * @param {String} pServiceHash - The hash of the service
     */
    constructor(pFable: any, pOptions: any, pServiceHash: string);
}
declare namespace PictTemplateProviderInlineTemplate {
    export { template_hash };
}
import libPictTemplate = require("pict-template");
declare const template_hash: "InlineTemplate";
//# sourceMappingURL=Pict-Template-InlineTemplate.d.ts.map