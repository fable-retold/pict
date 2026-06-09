export = PictProviderIcon;
declare class PictProviderIcon extends libPictProvider {
    constructor(pFable: any, pOptions: any, pServiceHash: any);
    /** @type {import('../Pict.js')} */
    pict: import("../Pict.js");
    _registry: {};
    _defaultsByName: {};
    /**
     * Register a single glyph.  First call for a (name) sets the default
     * variant for that name unless an explicit variant is passed; subsequent
     * calls add more variants without changing the default.
     *
     * @param {string} pName    PascalCase icon name (e.g. 'FileFolder')
     * @param {string} pSvg     Full <svg>...</svg> string (no width/height)
     * @param {object} [pOpts]  { variant: 'Outline'|'Filled'|... , default: bool, force: bool }
     * @returns {boolean}       true on success, false if a (name, variant)
     *                           already exists and { force: true } wasn't set.
     */
    register(pName: string, pSvg: string, pOpts?: object): boolean;
    /**
     * Bulk register a whole icon set, keyed by variant.
     *
     *   registerSet({ Outline: { Home: '<svg/>', Folder: '<svg/>' },
     *                 Filled:  { Home: '<svg/>' } });
     *
     * Per-name defaults follow registration order — the first variant
     * containing a given name becomes that name's default.
     *
     * @param {Record<string, Record<string, string>>} pByVariant
     * @param {object} [pOpts] { force: bool }
     */
    registerSet(pByVariant: Record<string, Record<string, string>>, pOpts?: object): void;
    /**
     * @param {string} pName
     * @param {string} [pVariant]
     * @returns {boolean}
     */
    has(pName: string, pVariant?: string): boolean;
    /**
     * Return the wrapped icon HTML for `pName`.  Always returns a string
     * — never throws and never returns undefined, so it's safe to embed
     * in template output unchecked.
     *
     * @param {string} pName     PascalCase icon name, or an alias
     * @param {object} [pOpts]   { variant, size, class, ariaLabel }
     * @returns {string}
     */
    get(pName: string, pOpts?: object): string;
    /**
     * @private
     * @param {string} pSvg
     * @param {object} [pOpts] { size, class, ariaLabel }
     * @returns {string}
     */
    private _wrap;
}
declare namespace PictProviderIcon {
    export { _DefaultProviderConfiguration as default_configuration };
}
import libPictProvider = require("pict-provider");
declare namespace _DefaultProviderConfiguration {
    let ProviderIdentifier: string;
    let AutoInitialize: boolean;
    let AutoInitializeOrdinal: number;
    let DefaultVariant: string;
    let DefaultIconClass: string;
    let DefaultSize: any;
    let RegisterBaseIcons: boolean;
}
//# sourceMappingURL=Provider-Icon.d.ts.map