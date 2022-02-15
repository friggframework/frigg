import React from 'react';
import IntegrationCard from '../components/IntegrationCard';

const integrations = [
	{
		id: 1,
		name: 'Attentive',
		category: 'Marketing',
		description: 'Lorem ipsum...',
        image: 'data:image/png;base64,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'
	},
	{
		id: 2,
		name: 'ActiveCampaign',
		category: 'Marketing',
		description: 'Lorem ipsum...',
        image: 'data:image/png;base64,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'
	},
	{
		id: 3,
		name: 'HubSpot',
		category: 'Marketing',
		description: 'Lorem ipsum...',
		image: 'data:image/png;base64,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'

	},
	{
		id: 4,
		name: 'Salesloft',
		category: 'Marketing',
		description: 'Lorem ipsum...',
		image: 'https://salesloft.com/wp-content/uploads/2021/08/sl-logo.png'
	},
	{
		id: 5,
		name: 'Monday.com',
		category: 'CRM',
		description: 'Lorem ipsum...',
		image: 'https://pbs.twimg.com/profile_images/937264936379666432/PinlaRAw_400x400.jpg'
	},
	{
		id: 6,
		name: 'RollWorks',
		category: 'Marketing',
		description: 'Lorem ipsum...',
		image: 'https://pbs.twimg.com/profile_images/1492247933336621057/IlnxbLzk_400x400.jpg'
	},
	{
		id: 7,
		name: 'Salesforce',
		category: 'CRM',
		description: 'Lorem ipsum...',
		image: 'https://pbs.twimg.com/profile_images/1268205537637748736/jyoK_62Q_400x400.jpg'
	},
	{
		id: 8,
		name: 'Marketo',
		category: 'Marketing',
		description: 'Lorem ipsum...',
		image: 'https://pbs.twimg.com/profile_images/1410592751478001671/fy8B2ea2_400x400.jpg'
	},
	{
		id: 9,
		name: 'Terminus',
		category: 'Marketing',
		description: 'Lorem ipsum...',
		image: 'https://pbs.twimg.com/profile_images/1410592751478001671/fy8B2ea2_400x400.jpg'
	}
];

function IntegrationsPage() {
	return (
		<main className="h-full pb-16 overflow-y-auto">
			<div className="container px-6 mx-auto grid">
				<h2 className="my-6 text-2xl font-semibold text-gray-700 dark:text-gray-200">Integrations</h2>


				<div class="grid gap-6 mb-8 md:grid-cols-2 xl:grid-cols-4">
					<div class="col-span-1 pl-10">
						<h4 class="mb-4 text-lg font-semibold text-gray-600 dark:text-gray-300">
							<span class="border-b-4 border-green-500">Recently added</span>
						</h4>
						<h4 class="mb-4 text-lg font-semibold text-gray-600 dark:text-gray-500">
							Marketing
						</h4>
						<h4 class="mb-4 text-lg font-semibold text-gray-600 dark:text-gray-500">
							Sales & CRM
						</h4>
						<h4 class="mb-4 text-lg font-semibold text-gray-600 dark:text-gray-500">
							Commerce
						</h4>
						<h4 class="mb-4 text-lg font-semibold text-gray-600 dark:text-gray-500">
							Social
						</h4>
						<h4 class="mb-4 text-lg font-semibold text-gray-600 dark:text-gray-500">
							Productivity
						</h4>
						<h4 class="mb-4 text-lg font-semibold text-gray-600 dark:text-gray-500">
							Devops
						</h4>
					</div>
					<div class="grid gap-6 col-span-3 grid-cols-3">
					
						{integrations.map((integration) => (
							<IntegrationCard integration={integration} />
						))}
					</div>
                </div>
			</div>
		</main>
	);
}

export default IntegrationsPage;
