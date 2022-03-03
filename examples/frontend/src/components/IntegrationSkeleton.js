import React from 'react';

function IntegrationSkeleton() {
	return (
		<>
			<div className="flex p-4 bg-gray-200 rounded-lg shadow-xs animate-pulse">
				<div className="mr-4 w-20 h-20 bg-gray-400 rounded-lg overflow-hidden animate-pulse"></div>
				<div>
					<p className="h-6 w-20 bg-gray-400"></p>
					<p className="mb-2 mt-2 h-4 w-16 bg-gray-400"></p>
				</div>
				<div className="ml-auto">
					<div className="relative">
						<div className="px-3 py-2 h-10 w-16 bg-gray-400"></div>
					</div>
				</div>
			</div>
		</>
	);
}

export default IntegrationSkeleton;
