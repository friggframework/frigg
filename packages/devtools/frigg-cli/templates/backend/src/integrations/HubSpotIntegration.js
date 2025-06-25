const { get, IntegrationBase, Options } = require('@friggframework/core');
const { Definition: HubSpotModule } = require('@friggframework/api-module-hubspot');

class HubSpotIntegration extends IntegrationBase {
    static Config = {
        name: 'hubspot',
        version: '1.0.0',
        supportedVersions: ['1.0.0'],
        events: ['SEARCH_DEALS'],
    };

    static Options =
        new Options({
            module: HubSpotModule,
            integrations: [HubSpotModule],
            display: {
                name: 'HubSpot',
                description: 'Sales & CRM, Marketing',
                category: 'Sales & CRM, Marketing',
                detailsUrl: 'https://hubspot.com',
                icon: 'https://friggframework.org/assets/img/hubspot-icon.jpeg',
            },
            hasUserConfig: true,
        });

    static modules = {
        hubspot: HubSpotModule,
    }

    /**
     * HANDLE EVENTS
     */
    async receiveNotification(notifier, event, object = null) {
        if (event === 'SEARCH_DEALS') {
            return this.target.api.searchDeals(object);
        }
    }

    /**
     * ALL CUSTOM/OPTIONAL METHODS FOR AN INTEGRATION MANAGER
     */
    async getSampleData() {
        const res = await this.target.api.searchDeals()
        console.log(res.results.length)
        const formatted = res.results.map(deal => {
            const formattedDeal = {
                id: deal.id,
                name: deal.properties.dealname,
                dealStage: deal.properties.dealstage,
                daysToClose: deal.properties.days_to_close,
                createdAt: deal.createdAt,
                closeDate: deal.properties.closedate,
            }


            return formattedDeal
        })
        return {data: formatted}

    }

    /**
     * ALL REQUIRED METHODS FOR AN INTEGRATION MANAGER
     */
    async onCreate(params) {
        // Validate that we have all of the data we need
        // Set integration status as makes sense. Default ENABLED
        // TODO turn this into a validateConfig method/function
        this.record.status = 'ENABLED';
        await this.record.save();
        return this.record;
    }

    async onUpdate(params) {
        const newConfig = get(params, 'config');
        const oldConfig = this.record.config;
        // Just save whatever
        this.record.markModified('config');
        await this.record.save();
        return this.validateConfig();
    }

    async getConfigOptions() {
        const options = {}
        return options;
    }
}

module.exports = HubSpotIntegration;
