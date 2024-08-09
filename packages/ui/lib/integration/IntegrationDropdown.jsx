import React, { useState } from 'react';
import { EllipsisVertical } from 'lucide-react';

function IntegrationDropdown({ getSampleData, disconnectIntegration, name, hasUserConfig }) {
	const [dropdown, setDropdown] = useState(false);

	return (
		<>
			<EllipsisVertical
				onClick={() => setDropdown(!dropdown)}
				className="h-6 w-6 ml-auto text-gray-500 cursor-pointer"
			/>

			{dropdown ? (
				<div
					className="origin-top-right mt-8 absolute right-0 w-40 z-50 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 focus:outline-none"
					role="menu"
					aria-orientation="vertical"
					aria-labelledby="menu-button"
					tabIndex="-1"
				>
					<div className="py-1" role="none">
						{hasUserConfig ? (<span
							className="text-gray-700 block px-4 py-2 text-sm hover:bg-gray-200"
							role="menuitem"
							tabIndex="-1"
							id="menu-item-1"
						>
							Configure
						</span>) : null}
						<span
							className="text-gray-700 block px-4 py-2 text-sm hover:bg-gray-200"
							role="menuitem"
							tabIndex="-1"
							id="menu-item-2"
							onClick={getSampleData}
						>
							Get Sample Data
						</span>
						<span
							className="text-gray-700 block px-4 py-2 text-sm hover:bg-gray-200"
							role="menuitem"
							tabIndex="-1"
							id="menu-item-1"
							onClick={disconnectIntegration}
						>
							Disconnect
						</span>
					</div>
				</div>
			) : null}
		</>
	);
}

export default IntegrationDropdown;
