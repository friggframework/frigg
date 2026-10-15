const { User } = require('./user');

/**
 * Find-or-create steps shared by the paths that identify a user by an app user
 * id and/or app organization id (x-frigg headers, adopter token). Each path
 * keeps its own policy between "find" and "create".
 */

const wantsIndividual = (userConfig) =>
    userConfig.individualUserRequired !== false;

const wantsOrganization = (userConfig, appOrgId) =>
    Boolean(appOrgId) && Boolean(userConfig.organizationUserRequired);

/**
 * A create that lost a race: the Prisma unique-constraint code, a Mongo
 * duplicate-key code, or the message `insertOne` raises for one.
 */
function isUniqueViolation(error) {
    return (
        error?.code === 'P2002' ||
        error?.code === 11000 ||
        /Duplicate key violation|E11000/.test(error?.message ?? '')
    );
}

/**
 * Runs `create`; if it loses a first-login race (a unique-constraint
 * violation), runs `find` once, since the winner has created the row by now.
 * Anything else, and a violation with nothing to find, is rethrown.
 */
async function createOrFindOnRace(create, find) {
    try {
        return await create();
    } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        const found = await find();
        if (!found) throw error;
        return found;
    }
}

async function findAppUsers(
    userRepository,
    userConfig,
    { appUserId, appOrgId }
) {
    const individual =
        appUserId && wantsIndividual(userConfig)
            ? await userRepository.findIndividualUserByAppUserId(appUserId)
            : null;
    const organization = wantsOrganization(userConfig, appOrgId)
        ? await userRepository.findOrganizationUserByAppOrgId(appOrgId)
        : null;
    return { individual, organization };
}

/**
 * Creates whichever of the two users is wanted and missing. Does not link
 * them: linking is policy.
 */
async function createMissingAppUsers(
    userRepository,
    userConfig,
    { appUserId, appOrgId, individual, organization }
) {
    if (!individual && appUserId && wantsIndividual(userConfig)) {
        individual = await createOrFindOnRace(
            () =>
                userRepository.createIndividualUser({
                    appUserId,
                    username: `app-user-${appUserId}`,
                    email: `${appUserId}@app.local`,
                }),
            () => userRepository.findIndividualUserByAppUserId(appUserId)
        );
    }
    if (!organization && wantsOrganization(userConfig, appOrgId)) {
        organization = await createOrFindOnRace(
            () => userRepository.createOrganizationUser({ appOrgId }),
            () => userRepository.findOrganizationUserByAppOrgId(appOrgId)
        );
    }
    return { individual, organization };
}

function buildUser(userConfig, individual, organization) {
    return new User(
        individual,
        organization,
        userConfig.usePassword,
        userConfig.primary,
        userConfig.individualUserRequired,
        userConfig.organizationUserRequired
    );
}

module.exports = {
    wantsIndividual,
    wantsOrganization,
    isUniqueViolation,
    findAppUsers,
    createMissingAppUsers,
    buildUser,
};
