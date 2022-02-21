import React from 'react';
// import { Link } from 'react-router-dom';
import { DuplicateIcon } from '@heroicons/react/outline';

function AppCard() {
	return (
		<div
			className="flex items-center p-4 bg-white rounded-lg shadow-xs dark:bg-gray-800 border-2 dark:border-gray-700 dark:hover:bg-gray-700 cursor-pointer"
		>
		  <div
			className="p-3 mr-4 text-gray-700 dark:text-gray-200 align-text-top"
		  >
			<DuplicateIcon className="w-8 h-8" />
		  </div>
		  <div>
			<p
			  className="text-lg font-semibold text-gray-700 dark:text-gray-200"
			>
			  frigg-demo
			</p>
			<p
			  className="mb-2 pt-2 text-sm font-medium text-gray-600 dark:text-gray-400"
			>
			  aws lambda | us-east-1
			</p>
		  </div>
		</div>
	);
}

export default AppCard;
