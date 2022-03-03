import React from 'react';
import { SearchIcon, BellIcon } from '@heroicons/react/outline';

function Navbar() {
	return (
		<header className="z-10 py-4 bg-white shadow-sm dark:bg-gray-800">
			<div className="container flex items-center justify-between h-full px-6 mx-auto text-purple-500 dark:text-green-300">
				<div className="flex justify-center flex-1 lg:mr-32">
					<div className="relative w-full max-w-xl mr-6 focus-within:text-purple-400">
						<div className="absolute inset-y-0 flex items-center pl-2">
							<SearchIcon className="w-4 h-4" />
						</div>
						<input
							className="w-full pl-8 pr-2 text-sm text-gray-700 placeholder-gray-600 bg-gray-100 border-0 rounded-md dark:placeholder-gray-500 dark:focus:shadow-outline-gray dark:focus:ring-green-400 dark:focus:placeholder-gray-600 dark:bg-gray-700 dark:text-gray-200 focus:placeholder-gray-500 focus:bg-white focus:border-green-300 focus:outline-none focus:shadow-outline-green form-input"
							type="text"
							placeholder="Search..."
							aria-label="Search"
						/>
					</div>
				</div>
				<ul className="flex items-center flex-shrink-0 space-x-6">
					<li className="relative">
						<button
							className="relative align-middle rounded-md focus:outline-none focus:shadow-outline-purple"
							aria-label="Notifications"
							aria-haspopup="true"
						>
							<BellIcon className="w-5 h-5" />
							<span
								aria-hidden="true"
								className="absolute top-0 right-0 inline-block w-3 h-3 transform translate-x-1 -translate-y-1 bg-red-600 border-2 border-white rounded-full dark:border-gray-800"
							></span>
						</button>
					</li>
					<li className="relative">
						<button
							className="align-middle rounded-full focus:shadow-outline-purple focus:outline-none"
							aria-label="Account"
							aria-haspopup="true"
						>
							<img
								className="object-cover w-8 h-8 rounded-full"
								src="https://avatars.githubusercontent.com/u/931781?v=4"
								alt=""
								aria-hidden="true"
							/>
						</button>
					</li>
				</ul>
			</div>
		</header>
	);
}

export default Navbar;
