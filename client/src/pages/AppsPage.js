import React from 'react';
import AppCard from '../components/AppCard';

function AppsPage() {
	return (
		<main className="h-full pb-16 overflow-y-auto">
			<div className="container px-6 mx-auto grid">
				<div className="flex">
              		<h2 className="my-6 text-2xl font-semibold text-gray-700 dark:text-gray-200">
                		Apps
              		</h2>
					<div className="px-6 my-6 justify-end">
						<button
							className="flex items-center justify-between w-full px-4 py-2 text-sm font-medium leading-5 text-white transition-colors duration-150 bg-green-500 border border-transparent rounded-lg active:bg-green-500 hover:bg-green-700 focus:outline-none focus:shadow-outline-purple"
						>
							New app
							<span className="ml-2" aria-hidden="true">+</span>
						</button>
					</div>
				</div>
            	<div className="grid gap-6 mb-8 md:grid-cols-2 xl:grid-cols-4">
					<AppCard />
            	</div>
			</div>
		</main>
	);
}

export default AppsPage;
