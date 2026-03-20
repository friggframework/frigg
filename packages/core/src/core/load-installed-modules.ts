import { readFileSync } from 'node:fs';
import { join as joinPathParts } from 'node:path';

interface PackageJson {
    dependencies?: Record<string, string>;
    [key: string]: unknown;
}

export const loadInstalledModules = (): unknown[] => {
    const pathToPackage = joinPathParts(process.cwd(), 'package.json');
    const contents = readFileSync(pathToPackage, 'utf-8');
    const pkg: PackageJson = JSON.parse(contents);
    const dependencyNames = pkg.dependencies
        ? Object.keys(pkg.dependencies)
        : [];
    const installedNames = dependencyNames.filter((name) => {
        const withoutOrganization = name.split('/').pop()!;
        return withoutOrganization.startsWith('frigg-module-');
    });
    const manifests = installedNames.map((name) => {
        const pathToManifest = joinPathParts(
            process.cwd(),
            'node_modules',
            name
        );
        const manifestContents = readFileSync(pathToManifest, 'utf-8');
        return JSON.parse(manifestContents) as unknown;
    });
    return manifests;
};

