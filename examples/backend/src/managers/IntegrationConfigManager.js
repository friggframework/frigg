const LHIntegrationConfigManager = require('../base/managers/LHIntegrationConfigManager');
const Options = require('../base/objects/integration/Options');

// Entities that we are going to use for integration for this particular app
const CrossbeamManager = require('./entities/CrossbeamManager');
const MondayManager = require('./entities/MondayManager');
const RollWorksManager = require('./entities/RollWorksManager');
const QBOManager = require('./entities/QBOManager');
const HubSpotManager = require('./entities/HubSpotManager');
const RevioManager = require('./entities/RevioManager');
const SalesloftManager = require('./entities/SalesloftManager');
const SalesforceManager = require('./entities/SalesforceManager');
const FastSpringIQManager = require('./entities/FastSpringIQManager');
const StackManager = require('./entities/StackManager');
const ConnectWiseManager = require('./entities/ConnectWiseManager');
const MarketoManager = require('./entities/MarketoManager');
const ActiveCampaignManager = require('./entities/ActiveCampaignManager');
const OutreachManager = require('./entities/OutreachManager');
const AttentiveManager = require('./entities/AttentiveManager');

class IntegrationConfigManager extends LHIntegrationConfigManager {
    constructor(params) {
        super(params);
        this.primary = QBOManager;
        this.options = [
            new Options({
                module: AttentiveManager,
                integrations: [QBOManager],
                display: {
                    name: 'Attentive',
                    description:
                        'Attentive is a personalized text messaging platform for innovative brands.',
                    detailsUrl: 'https://www.attentivemobile.com/',
                    icon: 'https://pbs.twimg.com/profile_images/1410627524242051079/6X6P4CGP_400x400.png',
                },
            }),
            new Options({
                module: ActiveCampaignManager,
                integrations: [CrossbeamManager],
                display: {
                    name: 'ActiveCampaign',
                    description:
                        'ActiveCampaign gives you the email marketing, marketing automation, and CRM tools you need to create incredible customer experiences.',
                    detailsUrl: 'https://www.activecampaign.com/',
                    icon: 'https://www.activecampaign.com/site/assets/press/branding/mark-white.svg',
                },
                hasUserConfig: true,
            }),
            new Options({
                module: QBOManager,
                integrations: [QBOManager],
                display: {
                    name: 'QuickBooks Online',
                    description: 'A test integration for QBO',
                    detailsUrl: 'https://lefthook.co',
                    icon: 'https://mpng.subpng.com/20180920/ssx/kisspng-using-quickbooks-intuit-accounting-software-5ba374c2194308.8854984915374389141035.jpg',
                },
            }),
            new Options({
                module: HubSpotManager,
                integrations: [QBOManager],
                display: {
                    name: 'HubSpot',
                    description: 'A test integration for hubspot',
                    detailsUrl: 'https://hubspot.com',
                    icon: 'https://www.hubspot.com/hubfs/assets/hubspot.com/style-guide/brand-guidelines/guidelines_the-logo.svg',
                },
            }),
            new Options({
                module: MondayManager,
                integrations: [CrossbeamManager],
                display: {
                    name: 'monday.com',
                    description:
                        'Sync your Crossbeam partner population Accounts and Lead data to monday.com Boards for easy task assigment and workflow automation.',
                    detailsUrl: 'https://monday.com',
                    icon: 'monday.com',
                },
                hasUserConfig: true,
            }),
            new Options({
                module: RevioManager,
                integrations: [QBOManager],
                display: {
                    name: 'Rev',
                    description: 'A test integration for Rev',
                    detailsUrl: 'https://rev.io.com',
                    icon: 'https://encrypted-tbn0.gstatic.com/images?q=tbn%3AANd9GcRqOzId5UW9GLoM89GRu6hjhLsN03snpuMfUA&usqp=CAU',
                },
            }),
            new Options({
                module: ConnectWiseManager,
                integrations: [QBOManager],
                display: {
                    name: 'ConnectWise',
                    description: 'A test integration for ConnectWise',
                    detailsUrl: 'https://connectwise.com',
                    icon: 'https://www.connectwise.com/globalassets/media/logos/company/connectwise-vert-master.png',
                },
            }),
            new Options({
                module: RollWorksManager,
                integrations: [CrossbeamManager],
                display: {
                    name: 'RollWorks',
                    description:
                        'Automatically create Target Account Lists from your Crossbeam reports. Drive demand fast with easy target account discovery and prioritization, account-based digital advertising, and automated sales outreach.',
                    detailsUrl: 'https://rollworks.com',
                    icon: 'rollworks.com',
                },
                hasUserConfig: true,
            }),
            new Options({
                module: SalesloftManager,
                integrations: [QBOManager],
                display: {
                    name: 'Salesloft',
                    description: 'A test integration for Salesloft',
                    detailsUrl: 'https://salesloft.com/',
                    icon: 'https://salesloft.com/wp-content/uploads/2021/08/sl-logo.png',
                },
            }),
            new Options({
                module: SalesforceManager,
                integrations: [QBOManager],
                display: {
                    name: 'Salesforce',
                    description:
                        'Salesforce is the world’s #1 customer relationship management (CRM) platform. We help your marketing, sales, commerce, service and IT teams work as one from anywhere — so you can keep your customers happy everywhere.',
                    detailsUrl: 'https://salesforce.com',
                    icon: '/salesforce_logo.svg',
                },
            }),
            new Options({
                module: FastSpringIQManager,
                integrations: [QBOManager],
                display: {
                    name: 'FastSpring IQ',
                    description:
                        'FastSpring IQ is customized quoting on steroids',
                    detailsUrl: 'https://fastspring.com',
                    icon: 'data:image/png;base64,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',
                },
                hasUserConfig: true,
            }),
            new Options({
                module: StackManager,
                integrations: [QBOManager],
                display: {
                    name: 'Stack Global',
                    description:
                        'Stack Global helps the CSuite hone in on their go to market and sales processes',
                    detailsUrl: 'https://stackglobal.io',
                    icon: 'https://images.squarespace-cdn.com/content/v1/5e6e12fb668a2e3fcf731a71/1584279387633-IZC814VNUVK0Y03ELOAG/stack-logo.png?format=125w',
                },
                hasUserConfig: true,
            }),
            new Options({
                module: CrossbeamManager,
                integrations: [QBOManager],
                display: {
                    name: 'Crossbeam',
                    description: 'Supercharge your Partnerships',
                    detailsUrl: 'https://crossbeam.com',
                    icon: 'https://www.crossbeam.com/img/Logo.svg',
                },
                hasUserConfig: true,
            }),
            new Options({
                module: MarketoManager,
                integrations: [QBOManager],
                display: {
                    name: 'Marketo',
                    description: 'A test integration for Marketo',
                    detailsUrl: 'https://marketo.com',
                    icon: 'https://upload.wikimedia.org/wikipedia/commons/b/b5/Marketo_logo.svg',
                },
            }),
            new Options({
                module: OutreachManager,
                integrations: [QBOManager],
                display: {
                    name: 'Outreach',
                    description: 'A test integration for Outreach',
                    detailsUrl: 'https://outreach.io',
                    icon: 'https://www.outreach.io/_resources/img/logo.min.svg',
                },
            }),
        ];
    }
}

module.exports = IntegrationConfigManager;
