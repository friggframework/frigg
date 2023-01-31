// my-custom-environment
const NodeEnvironment = require('jest-environment-node').TestEnvironment;

class CustomEnvironment extends NodeEnvironment {
    constructor(config, context) {
        super(config, context);
        this.testPath = context.testPath;
        this.docblockPragmas = context.docblockPragmas;
    }

    async setup() {
        await super.setup();
        this.global.mockApiResults = {
            testErrors: 0,
            didAllTestsPass: true,
        };
        // await someSetupTasks(this.testPath);
        // this.global.someGlobalObject = createGlobalObject();

        // Will trigger if docblock contains @my-custom-pragma my-pragma-value
        if (this.docblockPragmas['my-custom-pragma'] === 'my-pragma-value') {
            // ...
        }
    }

    async teardown() {
        this.global.mockApiResults = null;
        // await someTeardownTasks();
        await super.teardown();
    }

    getVmContext() {
        return super.getVmContext();
    }

    async handleTestEvent(event, state) {
        if (event.name === 'test_fn_failure') {
            this.global.mockApiResults.testErrors++;
            this.global.mockApiResults.didAllTestsPass = false;
            // ...
        }
    }
}

module.exports = CustomEnvironment;
