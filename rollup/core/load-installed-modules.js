const { readFileSync } = require('fs');
const { join: joinPathParts } = require('path');

const loadInstalledModules = () => {
    const pathToPackage = joinPathParts(process.cwd(), 'package.json');
    const contents = readFileSync(pathToPackage);
    const pkg = JSON.parse(contents);
    const dependencyNames = pkg.dependencies
        ? Object.keys(pkg.dependencies)
        : [];
    const installedNames = dependencyNames.filter((name) => {
        const withoutOrganization = name.split('/').pop();
        return withoutOrganization.startsWith('frigg-module-');
    });
    const manifests = installedNames.map((name) => {
        // TODO could require them here, but that doesn;'t play well with webpack......... maybe need to put them in a .friggrc.js file...
        const pathToManifest = joinPathParts(
            process.cwd(),
            'node_modules',
            name
        );
        const manifestContents = readFileSync(pathToManifest);
        return JSON.parse(manifestContents);
    });
    return manifests;
};

module.exports = { loadInstalledModules };
