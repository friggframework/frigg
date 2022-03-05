import React from 'react';
import AppCard from '../components/AppCard';

const customers = [
	{
		id: 1,
		name: 'Hans Burger',
		amount: 898.45,
		image:
			'https://images.unsplash.com/flagged/photo-1570612861542-284f4c12e75f?ixlib=rb-1.2.1&q=80&fm=jpg&crop=entropy&cs=tinysrgb&w=200&fit=max&ixid=eyJhcHBfaWQiOjE3Nzg0fQ',
	},
	{
		id: 2,
		name: 'Jolina Angelie',
		amount: 369.95,
		image:
			'https://images.unsplash.com/photo-1494790108377-be9c29b29330?ixlib=rb-0.3.5&q=80&fm=jpg&crop=entropy&cs=tinysrgb&w=200&facepad=3&fit=facearea&s=707b9c33066bf8808c934c8ab394dff6',
	},
	{
		id: 3,
		name: 'Sarah Curry',
		amount: 9002.18,
		image:
			'https://images.unsplash.com/photo-1551069613-1904dbdcda11?ixlib=rb-1.2.1&q=80&fm=jpg&crop=entropy&cs=tinysrgb&w=200&fit=max&ixid=eyJhcHBfaWQiOjE3Nzg0fQ',
	},
	{
		id: 4,
		name: 'Rulia Joberts',
		amount: 6453.15,
		image:
			'https://images.unsplash.com/photo-1551006917-3b4c078c47c9?ixlib=rb-1.2.1&q=80&fm=jpg&crop=entropy&cs=tinysrgb&w=200&fit=max&ixid=eyJhcHBfaWQiOjE3Nzg0fQ',
	},
	{
		id: 5,
		name: 'Wenzel Dashington',
		amount: 898.45,
		image:
			'https://images.unsplash.com/photo-1546456073-6712f79251bb?ixlib=rb-1.2.1&q=80&fm=jpg&crop=entropy&cs=tinysrgb&w=200&fit=max&ixid=eyJhcHBfaWQiOjE3Nzg0fQ',
	},
	{
		id: 6,
		name: 'Dave Li',
		amount: 898.45,
		image:
			'https://images.unsplash.com/photo-1502720705749-871143f0e671?ixlib=rb-0.3.5&q=80&fm=jpg&crop=entropy&cs=tinysrgb&w=200&fit=max&s=b8377ca9f985d80264279f277f3a67f5',
	},
	{
		id: 7,
		name: 'Maria Ramovic',
		amount: 898.45,
		image:
			'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?ixlib=rb-1.2.1&q=80&fm=jpg&crop=entropy&cs=tinysrgb&w=200&fit=max&ixid=eyJhcHBfaWQiOjE3Nzg0fQ',
	},
	{
		id: 8,
		name: 'Hitney Wouston',
		amount: 898.45,
		image:
			'https://images.unsplash.com/photo-1566411520896-01e7ca4726af?ixlib=rb-1.2.1&q=80&fm=jpg&crop=entropy&cs=tinysrgb&w=200&fit=max&ixid=eyJhcHBfaWQiOjE3Nzg0fQ',
	},
];

function DashboardPage() {
	return (
		<main className="h-full pb-16 overflow-y-auto">
			<div className="container px-6 mx-auto grid">
				<div className="flex">
					<h2 className="my-6 text-2xl font-semibold text-gray-700 dark:text-gray-200">Dashboard</h2>
				</div>
				<div className="grid gap-6 mb-8 md:grid-cols-2 xl:grid-cols-4">
					<AppCard title={'Total Customers'} value={'340'} />
					<AppCard title={'Monthly Revenue'} value={'$340,862'} />
					<AppCard title={'Avg Revenue/Customer'} value={'$3,409'} />
					<AppCard title={'Montly Churn'} value={'2'} />
				</div>

				<div className="w-full overflow-hidden rounded-lg shadow-xs">
					<div className="w-full overflow-x-auto">
						<table className="w-full whitespace-no-wrap">
							<thead>
								<tr className="text-xs font-semibold tracking-wide text-left text-gray-500 uppercase border-b dark:border-gray-700 bg-gray-50 dark:text-gray-400 dark:bg-gray-800">
									<th className="px-4 py-3">Customer</th>
									<th className="px-4 py-3">Amount</th>
									<th className="px-4 py-3">Last Updated</th>
									<th className="px-4 py-3">Status</th>
								</tr>
							</thead>
							<tbody className="bg-white divide-y dark:divide-gray-700 dark:bg-gray-800">
								{customers.map((customer) => (
									<tr key={customer.id} className="text-gray-700 dark:text-gray-400">
										<td className="px-4 py-3">
											<div className="flex items-center text-sm">
												<div className="relative hidden w-8 h-8 mr-3 rounded-full md:block">
													<img className="object-cover w-full h-full rounded-full" src={customer.image} alt="" />
													<div className="absolute inset-0 rounded-full shadow-inner" aria-hidden="true"></div>
												</div>
												<div>
													<p className="font-semibold">{customer.name}</p>
													<p className="text-xs text-gray-600 dark:text-gray-400">user@bigsaas.com</p>
												</div>
											</div>
										</td>
										<td className="px-4 py-3 text-sm">${customer.amount}</td>
										<td className="px-4 py-3 text-sm">2/1/22</td>
										<td className="px-4 py-3 text-xs">
											<span className="px-2 py-1 font-semibold leading-tight text-green-700 bg-green-100 rounded-full dark:bg-green-700 dark:text-green-100">
												Approved
											</span>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</div>
			</div>
		</main>
	);
}

export default DashboardPage;
