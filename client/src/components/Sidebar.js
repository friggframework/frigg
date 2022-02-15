import React from 'react';
import { Link, NavLink } from 'react-router-dom';
import { connect } from "react-redux";
import { DuplicateIcon, PuzzleIcon, DatabaseIcon, AdjustmentsIcon, DocumentTextIcon, LogoutIcon } from '@heroicons/react/outline';
import { logoutUser } from "../actions/userActions";

function Sidebar({ logoutUser }) {
	return (
		<aside className="z-20 hidden w-64 overflow-y-auto bg-white dark:bg-gray-800 md:block flex-shrink-0">
			<div className="py-4 text-gray-500 dark:text-gray-400">
				<Link className="ml-6 text-2xl font-bold text-gray-800 dark:text-green-400" to="/apps">
					frigg_
				</Link>
				<ul className="mt-6">
					<li className="relative">
						<NavLink to="/apps" className={({isActive}) => ("px-6 py-3 inline-flex items-center w-full text-sm font-semibold transition-colors duration-150 hover:text-gray-800 dark:hover:text-gray-200" + (isActive ? " text-gray-800 dark:text-gray-100 border-l-8 border-green-500" : ""))}>
							<DuplicateIcon className="w-5 h-5" /><span className="ml-4">Apps</span>
						</NavLink>
					</li>
					<li className="relative">
						<NavLink to="/integrations" className={({isActive}) => ("px-6 py-3 inline-flex items-center w-full text-sm font-semibold transition-colors duration-150 hover:text-gray-800 dark:hover:text-gray-200" + (isActive ? " text-gray-800 dark:text-gray-100 border-l-8 border-green-500" : ""))}>
							<PuzzleIcon className="w-5 h-5" /><span className="ml-4">Integrations</span>
						</NavLink>
					</li>
					<li className="relative">
						<NavLink to="/databases" className={({isActive}) => ("px-6 py-3 inline-flex items-center w-full text-sm font-semibold transition-colors duration-150 hover:text-gray-800 dark:hover:text-gray-200" + (isActive ? " text-gray-800 dark:text-gray-100 border-l-8 border-green-500" : ""))}>
							<DatabaseIcon className="w-5 h-5" /><span className="ml-4">Databases</span>
						</NavLink>
					</li>
					<li className="relative">
						<NavLink to="/settings" className={({isActive}) => ("px-6 py-3 inline-flex items-center w-full text-sm font-semibold transition-colors duration-150 hover:text-gray-800 dark:hover:text-gray-200" + (isActive ? " text-gray-800 dark:text-gray-100 border-l-8 border-green-500" : ""))}>
							<AdjustmentsIcon className="w-5 h-5" /><span className="ml-4">Settings</span>
						</NavLink>
					</li>
					<li className="relative">
						<span className="px-6 py-3 inline-flex items-center w-full text-sm font-semibold transition-colors duration-150 hover:text-gray-800 dark:hover:text-gray-200 cursor-pointer">
							<DocumentTextIcon className="w-5 h-5" /><span className="ml-4">Docs</span>
						</span>
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
