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
    let createdOrganization = false;
    if (!individual && appUserId && wantsIndividual(userConfig)) {
        individual = await userRepository.createIndividualUser({
            appUserId,
            username: `app-user-${appUserId}`,
            email: `${appUserId}@app.local`,
        });
    }
    if (!organization && wantsOrganization(userConfig, appOrgId)) {
        organization = await userRepository.createOrganizationUser({
            appOrgId,
        });
        createdOrganization = true;
    }
    return { individual, organization, createdOrganization };
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
    findAppUsers,
    createMissingAppUsers,
    buildUser,
};
