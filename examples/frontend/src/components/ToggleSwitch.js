import React, { useState } from 'react';
import { DotsVerticalIcon } from '@heroicons/react/outline';

function ToggleSwitch({ getSampleData, disconnectIntegration, name }) {
	const [dropdown, setDropdown] = useState(false);

	return (
		<>
			<label htmlFor={name} className="flex items-center cursor-pointer">
				<input type="checkbox" id={name} className="sr-only" checked />
				<div className="block bg-purple-600 w-14 h-8 rounded-full"></div>
				<div className="dot absolute left-1 top-1 bg-white w-6 h-6 rounded-full transition"></div>
			</label>

			<DotsVerticalIcon
				onClick={() => setDropdown(!dropdown)}
				className="h-6 w-6 mt-4 ml-auto text-gray-500 cursor-pointer"
			/>

			{dropdown ? (
				<div
					className="origin-top-right mt-2 absolute right-0 w-40 z-50 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 focus:outline-none"
					role="menu"
					aria-orientation="vertical"
					aria-labelledby="menu-button"
					tabIndex="-1"
				>
					<div className="py-1" role="none">
						<span
							className="text-gray-700 block px-4 py-2 text-sm hover:bg-gray-200"
							role="menuitem"
							tabIndex="-1"
							id="menu-item-1"
						>
							Configure
						</span>
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

export default ToggleSwitch;
