import React, { useState } from "react";
import { DotsHorizontalIcon } from '@heroicons/react/outline';
import { Link } from 'react-router-dom';

function ConnectButton() {
	return (
		<button className="px-3 py-2 text-sm font-medium leading-5 text-center text-white transition-colors duration-150 bg-purple-600 border border-transparent rounded-lg active:bg-purple-600 hover:bg-purple-700 focus:outline-none focus:shadow-outline-purple">
			Connect
		</button>
	);
}

function ToggleSwitch({ integration }) {
	const [dropdown, setDropdown] = useState(false);

	return (
		<>
			<label for={integration.name} className="flex items-center cursor-pointer">
				<input type="checkbox" id={integration.name} className="sr-only" checked />
				<div className="block bg-purple-600 w-14 h-8 rounded-full"></div>
				<div className="dot absolute left-1 top-1 bg-white w-6 h-6 rounded-full transition"></div>
			</label>
			<svg onClick={() => setDropdown(!dropdown)} className="h-6 w-6 mt-5 ml-auto text-gray-500 cursor-pointer" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
  				<path stroke-linecap="round" stroke-linejoin="round" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
			</svg>
			{dropdown ? 
				<div className="origin-top-right absolute right-0 mt-2 w-40 z-50 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 focus:outline-none" role="menu" aria-orientation="vertical" aria-labelledby="menu-button" tabindex="-1">
					<div className="py-1" role="none">
						<span className="text-gray-700 block px-4 py-2 text-sm hover:bg-gray-200" role="menuitem" tabindex="-1" id="menu-item-1">Configure</span>
						<span className="text-gray-700 block px-4 py-2 text-sm hover:bg-gray-200" role="menuitem" tabindex="-1" id="menu-item-2">Get Sample Data</span>
						<span className="text-gray-700 block px-4 py-2 text-sm hover:bg-gray-200" role="menuitem" tabindex="-1" id="menu-item-1">Disconnect</span>
					</div>
				</div>
				: null
			}
		</>
	);
}

function IntegrationCard({ integration }) {
	return (
		<div className="flex p-4 bg-white rounded-lg shadow-xs dark:bg-gray-800 border-2 dark:border-gray-700">
			<div className="mr-4 w-20 h-20 bg-white rounded-lg overflow-hidden">
				<img className="w-full h-full object-center object-cover" alt={integration.name} src={integration.image} />
			</div>
			<div>
				<p className="text-lg font-semibold text-gray-700 dark:text-gray-200">
					{integration.name.length > 12 ? integration.name.substring(0, 11) + '...' : integration.name}
				</p>
				<p className="mb-2 pt-2 text-sm font-medium text-gray-600 dark:text-gray-400">{integration.category}</p>
			</div>
			<div className="ml-auto">
				<div className="relative">
					{integration.connected ? <ToggleSwitch integration={integration} /> : <ConnectButton />}
					{/* <ConnectButton /> */}
				</div>
			</div>
		</div>
	);
}

export default IntegrationCard;
