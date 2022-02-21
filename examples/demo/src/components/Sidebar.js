import React from 'react';
import { Link, NavLink } from 'react-router-dom';
import { connect } from "react-redux";
import { HomeIcon, UsersIcon, PuzzleIcon, AdjustmentsIcon, DocumentTextIcon, LogoutIcon } from '@heroicons/react/outline';
import { logoutUser } from "../actions/userActions";
import { CloudIcon } from '@heroicons/react/solid';

function Sidebar({ logoutUser }) {
	return (
		<aside className="z-20 hidden w-64 overflow-y-auto bg-white dark:bg-gray-800 md:block flex-shrink-0">
			<div className="py-4 text-gray-500 dark:text-gray-400">
				<Link className="ml-6 text-2xl font-bold text-purple-600 dark:text-green-500 inline-flex" to="/apps">
					<CloudIcon className="w-9 h-9" /><span className="ml-2">Big SaaS</span>
				</Link>
				<ul className="mt-6">
					<li className="relative">
						<NavLink to="/apps" className={({isActive}) => ("px-6 py-3 inline-flex items-center w-full text-sm font-semibold transition-colors duration-150 hover:text-gray-800 dark:hover:text-gray-200" + (isActive ? " text-gray-800 dark:text-gray-100 border-l-8 border-purple-600" : ""))}>
							<HomeIcon className="w-5 h-5" /><span className="ml-4">Dashboard</span>
						</NavLink>
					</li>
					<li className="relative">
						<NavLink to="/databases" className={({isActive}) => ("px-6 py-3 inline-flex items-center w-full text-sm font-semibold transition-colors duration-150 hover:text-gray-800 dark:hover:text-gray-200" + (isActive ? " text-gray-800 dark:text-gray-100 border-l-8 border-purple-600" : ""))}>
							<UsersIcon className="w-5 h-5" /><span className="ml-4">Customers</span>
						</NavLink>
					</li>
					<li className="relative">
						<NavLink to="/integrations" className={({isActive}) => ("px-6 py-3 inline-flex items-center w-full text-sm font-semibold transition-colors duration-150 hover:text-gray-800 dark:hover:text-gray-200" + (isActive ? " text-gray-800 dark:text-gray-100 border-l-8 border-purple-600" : ""))}>
							<PuzzleIcon className="w-5 h-5" /><span className="ml-4">Integrations</span>
						</NavLink>
					</li>
					<li className="relative">
						<NavLink to="/settings" className={({isActive}) => ("px-6 py-3 inline-flex items-center w-full text-sm font-semibold transition-colors duration-150 hover:text-gray-800 dark:hover:text-gray-200" + (isActive ? " text-gray-800 dark:text-gray-100 border-l-8 border-purple-600" : ""))}>
							<AdjustmentsIcon className="w-5 h-5" /><span className="ml-4">Settings</span>
						</NavLink>
					</li>
					<li className="relative" onClick={() => logoutUser()} >
						<span className="px-6 py-3 inline-flex items-center w-full text-sm font-semibold transition-colors duration-150 hover:text-gray-800 dark:hover:text-gray-200 cursor-pointer">
							<LogoutIcon className="w-5 h-5" /><span className="ml-4">Logout</span>
						</span>
					</li>
				</ul>
			</div>
		</aside>
	);
}

export default connect(null, { logoutUser })(Sidebar);
