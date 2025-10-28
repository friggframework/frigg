const { ITemplateGenerator } = require('../../application/ports');

class ServerlessTemplateGenerator extends ITemplateGenerator {
    constructor({ infrastructureComposer } = {}) {
        super();

        if (!infrastructureComposer) {
            throw new Error('infrastructureComposer is required');
        }

        this.infrastructureComposer = infrastructureComposer;
    }

    async generateTemplate({ appDefinition, discoveryResults = null, stage = 'dev' }) {
        if (!appDefinition) {
            throw new Error('appDefinition is required');
        }

        try {
            const templateResult = await this.infrastructureComposer.generateTemplate({
                appDefinition,
                stage,
                discoveryResults,
            });

            const summary = this._extractTemplateSummary(templateResult);

            return {
                template: templateResult.template,
                summary,
            };
        } catch (error) {
            throw new Error(`Failed to generate template: ${error.message}`);
        }
    }

    _extractTemplateSummary(templateResult) {
        const functions = [];
        const endpoints = [];
        const resources = {};

        if (templateResult.functions) {
            for (const [name, config] of Object.entries(templateResult.functions)) {
                functions.push({
                    name,
                    memory: config.memorySize || 256,
                    timeout: config.timeout || 30,
                });

                if (config.events) {
                    for (const event of config.events) {
                        if (event.http) {
                            endpoints.push({
                                method: event.http.method,
                                path: event.http.path,
                            });
                        }
                    }
                }
            }
        }

        if (templateResult.resources) {
            const resourceTypes = {};
            for (const [name, resource] of Object.entries(templateResult.resources)) {
                const type = resource.Type || 'Unknown';
                resourceTypes[type] = (resourceTypes[type] || 0) + 1;
            }
            resources.types = resourceTypes;
            resources.count = Object.keys(templateResult.resources).length;
        }

        return {
            functions,
            endpoints,
            resources,
        };
    }
}

module.exports = { ServerlessTemplateGenerator };
