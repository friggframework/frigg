/**
 * Function package patterns
 *
 * Utility Layer - Hexagonal Architecture
 *
 * osls 4 rejects `package.include` / `package.exclude` and only reads
 * `package.patterns` (ADR-050). Builders keep their include and exclude lists
 * and pass them through this helper, so one place owns the negation.
 *
 * osls resolves a function's files with `resolveFilePathsFromPatterns`: an
 * ordered list evaluated last-match-wins. On osls 3 a function `exclude` was
 * placed (negated) ahead of the function `include`. Frigg emits no
 * service-level include, exclude or patterns, so `[!exclude..., include...]`
 * reproduces the osls 3 order exactly, and is valid on osls 3 and osls 4.
 *
 * An exclude that already starts with `!` was treated by osls 3 as an include
 * in exclude position; it is emitted un-negated in the same position here.
 */

/**
 * @param {Object} [lists]
 * @param {string[]} [lists.include] - Globs to (re-)add after the excludes
 * @param {string[]} [lists.exclude] - Globs to remove
 * @returns {string[]} Value for `package.patterns`
 */
function toPackagePatterns({ include = [], exclude = [] } = {}) {
    return [
        ...exclude.map((pattern) =>
            pattern.startsWith('!') ? pattern.slice(1) : `!${pattern}`
        ),
        ...include,
    ];
}

module.exports = { toPackagePatterns };
