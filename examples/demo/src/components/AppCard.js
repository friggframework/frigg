import React from 'react';
// import { Link } from 'react-router-dom';
import { DuplicateIcon } from '@heroicons/react/outline';

function AppCard({ title, value }) {
	return (
		<div
			className="flex items-center p-4 bg-white rounded-lg shadow-xs dark:bg-gray-800 border-2 dark:border-gray-700 dark:hover:bg-gray-700 cursor-pointer"
		>
		  <div className="mx-auto text-center">
			<p className="mb-2 pt-2 text-sm font-medium text-gray-600 dark:text-gray-400">
			  {title}
			</p>
			<p className="mb-2 text-4xl font-semibold text-gray-700 dark:text-gray-200">
			  {value}
			</p>
		  </div>
		</div>
	);
}

export default AppCard;
