import React from 'react';
import { DotsHorizontalIcon } from '@heroicons/react/outline';
// import { Link, NavLink } from 'react-router-dom';


function IntegrationCard({ integration }) {
	return (

<div className="flex p-4 bg-white rounded-lg shadow-xs dark:bg-gray-800 border-2 dark:border-gray-700">
  <div className="mr-4 w-20 h-20 bg-white rounded-lg overflow-hidden">
	<img
	  className="w-full h-full object-center object-cover"
	  alt={integration.name}
	  src={integration.image}
	/>
  </div>
  <div>
	<p className="text-lg font-semibold text-gray-700 dark:text-gray-200">
	  {integration.name.length > 14 ? integration.name.substring(0, 11) + "..." : integration.name}
	</p>
	<p className="mb-2 pt-2 text-sm font-medium text-gray-600 dark:text-gray-400">
	  {integration.category}
	</p>
  </div>
  <div className="ml-auto">
	<div className="relative">

	  	<button className="w-full px-3 py-1 text-sm font-medium leading-5 text-white text-gray-700 transition-colors duration-150 border border-gray-400 rounded-lg dark:text-gray-400 sm:px-4 sm:py-2 sm:w-auto active:bg-transparent hover:border-gray-600 focus:border-gray-600 active:text-gray-500 focus:outline-none focus:shadow-outline-gray">
			<DotsHorizontalIcon className="h-7 w-7" />
	  	</button>

	</div>
  </div>
</div>

	);
}

export default IntegrationCard;