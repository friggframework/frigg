# Contributing

## Node and Npm version

When you work on code in this repo, make sure you are using Node 14.x and Npm 7.20.2. Npm > 7 is needed to use npm workspaces, but there is a bug using workspaces in certain situations on Npm > 7.20.2. See here for more info: https://github.com/npm/cli/issues/3637

There are different ways to switch versions of Node/NPM, here is one:

1.  Make sure n is installed

- The easiest way is `npm install -g n`.
- You may prefer to install n with Homebrew: `brew install n`
- More info: https://github.com/tj/n#installation

2.  Run `npm run use:engine` in the root directory. This is a shortcut for `n install 14 && npm install -g npm@7.20.2`. However, when you use `npm run use:engine`, the version numbers are automatically read from the root package.json's "engines" key.

## Linking the Workspaces

The first time you set up the monorepo, run `npm install` in the root directory. This will automatically link up all the workspaces in the monorepo so that each is depending on the local copies.

## Linking packages into other projects locally

In the case where you want to link a package from the monorepo into a package from another repo for local development, `npm link` is still needed. This is only needed when editing packages locally, that aren't all in the same monorepo. See here for more info: https://docs.npmjs.com/cli/v8/commands/npm-link#workspace-usage

If the monorepo is in a directory called frigg, and we want to use the local copy of the logs module in project B while we develop:

```
cd frigg
npm link --workspace=logs
cd ../project-b
npm link @friggframework/logs
```

Now, the local copy of the logs package is linked into project B's node_modules directory. Any local edits to the logs package will be immeidately available to your local copy of project B

## Workspaces

https://docs.npmjs.com/cli/v7/using-npm/workspaces

To test all workspaces, you can run `npm run test:all` in the root directory. This will be useful for local development, but won't catch everything in CI (specifically missing npm modules in a package).

You can run a command in all workspaces like so: `npm run lint:fix --workspaces`

You can run a command in just one workspace, for example: `npm test --workspace=logs`

## Creating a new workspace

To create a new workspace: `npm init --workspace=new-package`

A good rule of thumb is to name the package based on what it provides. This can help avoid a lot of "utils" packages. Obviously nothing wrong with "utils", "tools," or "helpers" packages per se, but it is often an indication the code can be organized more modularly.

Be sure each package has:

- a README.md (which is displayed on npmjs.com).
- a LICENSE.md file (make sure the attribution and date are correct)
- a package.json file with repository, description, correct license, and other important fields filled in

## Semver

When fixing a bug or making small tweaks use `npm version patch`
When adding a feature that doesn't alter the public interface to existing features, use `npm version minor`
When making a change that alters the public interface use `npm version major`.

## Publishing

After merging or rebasing a branch into main:

```sh
git checkout main
npm test --workspace=logs
npm version patch --workspace=logs # or major or minor
git commit -am'chore: release' && git push
npm publish --workspace=logs --access public
```

## Unpublishing

72 hours are given to unpublish a version without complications: https://docs.npmjs.com/policies/unpublish

```sh
cd logs
npm unpublish @friggframework/logs@0.0.1
cd ..
```
