import React, { Component } from 'react';
import { connect } from 'react-redux';
import { Button } from 'react-bootstrap';
import IntegrationList from './IntegrationList';
import ModalForm from './ModalForm';
import { showModalForm } from '../actions/modalForm';

// this component is an example landing page for the application
class Dashboard extends Component {
	constructor(props) {
		super(props);

		this.state = {
			// ... component state may or may not be used
		};
	}

	componentDidMount() {
		const jwt = this.props.authToken || sessionStorage.getItem('jwt');
		if (!jwt) {
			// you must be logged
			this.props.history.push('/logout');
		}
	}

	enableModalForm = () => {
		this.props.dispatch(showModalForm(true));
	};

	render() {
		return (
			<main className="h-full pb-16 overflow-y-auto">
				<div className="container px-6 mx-auto grid">
					<h2 className="my-6 text-2xl font-semibold text-gray-700 dark:text-gray-200">Integrations</h2>

					{/* <Button onClick={this.enableModalForm}>
                            {' '}
                            Show ModalForm.js{' '}
                        </Button>
                        <ModalForm /> */}

					<div className="grid gap-6 mb-8 md:grid-cols-2 xl:grid-cols-4">
						<div className="col-span-1 pl-10">
							<h4 className="mb-4 text-lg font-semibold text-gray-600 dark:text-gray-300">
								<span className="border-b-4 border-purple-600">Recently added</span>
							</h4>
							<h4 className="mb-4 text-lg font-semibold text-gray-600 dark:text-gray-500">Marketing</h4>
							<h4 className="mb-4 text-lg font-semibold text-gray-600 dark:text-gray-500">Sales & CRM</h4>
							<h4 className="mb-4 text-lg font-semibold text-gray-600 dark:text-gray-500">Commerce</h4>
							<h4 className="mb-4 text-lg font-semibold text-gray-600 dark:text-gray-500">Social</h4>
							<h4 className="mb-4 text-lg font-semibold text-gray-600 dark:text-gray-500">Productivity</h4>
							<h4 className="mb-4 text-lg font-semibold text-gray-600 dark:text-gray-500">Finance</h4>
						</div>
						<div className="grid gap-6 col-span-3 grid-cols-3">
							<IntegrationList />
							{/* {integrations.map((integration) => (
                                    <IntegrationCard integration={integration} />
                                ))} */}
						</div>
					</div>
				</div>
			</main>
		);
	}
}

// this function defines which of the redux store items we want,
// and the return value returns them as props to our component
function mapStateToProps({ auth }) {
	return {
		authToken: auth.token,
	};
}

// connects this component to the redux store.
export default connect(mapStateToProps)(Dashboard);
