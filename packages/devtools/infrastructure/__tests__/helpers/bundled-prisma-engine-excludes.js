/**
 * Shared cases for every builder whose functions bundle Prisma when the
 * Prisma layer is off.
 * @param {(usePrismaLayer: boolean, architecture?: string) => Promise<Object[]>|Object[]} functionsOf
 *   Builds the app and returns its function definitions
 */
function itBundlesOnlyTheTargetPrismaEngine(functionsOf) {
    it.each([
        [undefined, 'rhel-openssl-3.0.x', 'linux-arm64-openssl-3.0.x'],
        ['x86_64', 'rhel-openssl-3.0.x', 'linux-arm64-openssl-3.0.x'],
        ['arm64', 'linux-arm64-openssl-3.0.x', 'rhel-openssl-3.0.x'],
    ])(
        'with the layer off and architecture %s, the bundled Prisma keeps only the %s engine',
        async (architecture, target, otherTarget) => {
            for (const fn of await functionsOf(false, architecture)) {
                expect(fn.package.exclude).toEqual(
                    expect.arrayContaining([
                        '**/libquery_engine-debian*',
                        `**/libquery_engine-${otherTarget}*`,
                    ])
                );
                expect(fn.package.exclude).not.toContain(`**/libquery_engine-${target}*`);
            }
        }
    );

    it('with the layer on, adds no engine patterns, since the layer carries the engines', async () => {
        for (const fn of await functionsOf(true, 'arm64')) {
            expect(fn.package.exclude).not.toEqual(
                expect.arrayContaining(['**/libquery_engine-rhel-openssl-3.0.x*'])
            );
            expect(fn.package.exclude).not.toEqual(
                expect.arrayContaining(['**/libquery_engine-debian*'])
            );
        }
    });
}

module.exports = { itBundlesOnlyTheTargetPrismaEngine };
