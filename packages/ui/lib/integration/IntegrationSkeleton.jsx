import React from 'react';

function IntegrationSkeleton({ layout }) {
	return (
		<>
			{layout == 'default-horizontal' && (
				<div data-testid="skeleton-horizontal" className="flex p-4 bg-gray-200 rounded-lg shadow-xs animate-pulse">
					<div className="mr-4 w-20 h-20 bg-gray-400 rounded-lg overflow-hidden animate-pulse"></div>
					<div>
						<p className="h-6 w-20 bg-gray-400 animate-pulse"></p>
						<p className="mb-2 mt-2 h-4 w-16 bg-gray-400 animate-pulse"></p>
					</div>
					<div className="ml-auto">
						<div className="relative">
							<div className="px-3 py-2 h-10 w-16 bg-gray-400 animate-pulse"></div>
						</div>
					</div>
				</div>
			)}
			{layout == 'default-vertical' && (
				<div
					data-testid="skeleton-vertical"
					className="flex flex-col items-center p-4 bg-gray-200 rounded-lg shadow-xs animate-pulse"
				>
					<div className="w-[120px] h-[120px] mt-4 bg-gray-400 rounded-full  animate-pulse"></div>
					<div className="mt-4 w-36 h-10 bg-gray-400 animate-pulse"></div>
					<div className="mb-6 mt-2 w-16 h-6 bg-gray-400 animate-pulse"></div>
					<div className="items-center pb-3">
						<div className="relative">
							<div className="w-40 h-14 bg-gray-400 rounded-lg"></div>
						</div>
					</div>
				</div>
			)}
		</>
	);
}

export default IntegrationSkeleton;
