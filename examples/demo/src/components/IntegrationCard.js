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
	  {integration.name.length > 12 ? integration.name.substring(0, 11) + "..." : integration.name}
	</p>
	<p className="mb-2 pt-2 text-sm font-medium text-gray-600 dark:text-gray-400">
	  {integration.category}
	</p>
  </div>
  <div className="ml-auto">
	<div className="relative">

	  	<button className="px-3 py-2 text-sm font-medium leading-5 text-center text-white transition-colors duration-150 bg-purple-600 border border-transparent rounded-lg active:bg-purple-600 hover:bg-purple-700 focus:outline-none focus:shadow-outline-purple">
			Connect
	  	</button>

	</div>
  </div>
</div>

	);
}

export default IntegrationCard;