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
					description: 'Attentive is a personalized text messaging platform for innovative brands.',
					category: 'Marketing',
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
					category: 'Marketing',
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
					category: 'Finance',
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
					category: 'Marketing',
					detailsUrl: 'https://hubspot.com',
					icon: 'https://pbs.twimg.com/profile_images/1329180456286294018/DSFK8Mc0_400x400.png',
				},
			}),
			new Options({
				module: MondayManager,
				integrations: [CrossbeamManager],
				display: {
					name: 'monday.com',
					description:
						'Sync your Crossbeam partner population Accounts and Lead data to monday.com Boards for easy task assigment and workflow automation.',
					category: 'Productivity',
					detailsUrl: 'https://monday.com',
					icon: 'https://pbs.twimg.com/profile_images/937264936379666432/PinlaRAw_400x400.jpg',
				},
				hasUserConfig: true,
			}),
			new Options({
				module: RevioManager,
				integrations: [QBOManager],
				display: {
					name: 'Rev.io',
					description: 'A test integration for Rev',
					category: 'Finance',
					detailsUrl: 'https://rev.io',
					icon: 'https://pbs.twimg.com/profile_images/968580771077414913/-KR0mN0G_400x400.jpg',
				},
			}),
			new Options({
				module: ConnectWiseManager,
				integrations: [QBOManager],
				display: {
					name: 'ConnectWise',
					description: 'A test integration for ConnectWise',
					category: 'Productivity',
					detailsUrl: 'https://connectwise.com',
					icon: 'https://pbs.twimg.com/profile_images/1458563781127200770/bkWtjRoj_400x400.jpg',
				},
			}),
			new Options({
				module: RollWorksManager,
				integrations: [CrossbeamManager],
				display: {
					name: 'RollWorks',
					description:
						'Automatically create Target Account Lists from your Crossbeam reports. Drive demand fast with easy target account discovery and prioritization, account-based digital advertising, and automated sales outreach.',
					category: 'Marketing',
					detailsUrl: 'https://rollworks.com',
					icon: 'https://pbs.twimg.com/profile_images/1492247933336621057/IlnxbLzk_400x400.jpg',
				},
				hasUserConfig: true,
			}),
			new Options({
				module: SalesloftManager,
				integrations: [QBOManager],
				display: {
					name: 'Salesloft',
					description: 'A test integration for Salesloft',
					category: 'Sales & CRM',
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
					category: 'Sales & CRM',
					detailsUrl: 'https://salesforce.com',
					icon: 'https://pbs.twimg.com/profile_images/1268205537637748736/jyoK_62Q_400x400.jpg',
				},
			}),
			new Options({
				module: FastSpringIQManager,
				integrations: [QBOManager],
				display: {
					name: 'FastSpring IQ',
					description: 'FastSpring IQ is customized quoting on steroids',
					detailsUrl: 'https://fastspring.com',
					category: 'Finance',
					icon: 'https://pbs.twimg.com/profile_images/1497418283733045248/CI5nKvhb_400x400.jpg',
				},
				hasUserConfig: true,
			}),
			new Options({
				module: StackManager,
				integrations: [QBOManager],
				display: {
					name: 'Stack',
					description: 'Stack helps the CSuite hone in on their go to market and sales processes',
					category: 'Sales & CRM',
					detailsUrl: 'https://stackglobal.io',
					icon: 'https://media-exp1.licdn.com/dms/image/C4D0BAQF9__pWNFB57w/company-logo_200_200/0/1645618349304?e=1654128000&v=beta&t=pvPw4iGljpIfhXA-QX2O3bPAs3MWJFtGBcGZHEl-WWY',
				},
				hasUserConfig: true,
			}),
			new Options({
				module: CrossbeamManager,
				integrations: [QBOManager],
				display: {
					name: 'Crossbeam',
					description: 'Supercharge your Partnerships',
					category: 'Sales & CRM',
					detailsUrl: 'https://crossbeam.com',
					icon: 'https://pbs.twimg.com/profile_images/1410602712698298369/vStCK2n9_400x400.jpg',
				},
				hasUserConfig: true,
			}),
			new Options({
				module: MarketoManager,
				integrations: [QBOManager],
				display: {
					name: 'Adobe Marketo',
					description: 'A test integration for Marketo',
					category: 'Marketing',
					detailsUrl: 'https://marketo.com',
					icon: 'https://pbs.twimg.com/profile_images/1387103351825829888/97tr4IvS_400x400.png',
				},
			}),
			new Options({
				module: OutreachManager,
				integrations: [QBOManager],
				display: {
					name: 'Outreach',
					description: 'A test integration for Outreach',
					category: 'Sales & CRM',
					detailsUrl: 'https://outreach.io',
					icon: 'https://pbs.twimg.com/profile_images/1282767524975661057/1Q6AOlkp_400x400.png',
				},
			}),
		];
	}
}

module.exports = IntegrationConfigManager;
