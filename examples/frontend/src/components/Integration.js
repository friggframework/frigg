import React, { Component } from 'react';
import { withRouter } from 'react-router-dom';
import { connect } from 'react-redux';
import API from '../api/api';
import { showModalForm } from '../actions/modalForm';
import ToggleSwitch from './ToggleSwitch';
import { setIntegrations } from '../actions/integrations';
import { ExclamationCircleIcon } from '@heroicons/react/outline';

class Integration extends Component {
	constructor(props) {
		super(props);
		this.type = this.props.data.type;
		this.api = new API();
		const jwt = this.props.authToken || sessionStorage.getItem('jwt');
		this.api.setJwt(jwt);

		this.state = {
			// ... component state may or may not be used
			isLoading: false,
			setLoading: false,
			initialFormData: props.data.config,
		};
	}

	getAuthorizeRequirements = async () => {
		const authorizeData = await this.api.getAuthorizeRequirements(this.type, 'salesloft');
		console.log(authorizeData);
		if (authorizeData.type === 'oauth2') {
			window.location.href = authorizeData.url;
		}
		if (authorizeData.type !== 'oauth2') this.enableModalForm();
	};

	getSampleData = async () => {
		console.log('getSampleData', this.props.data.id);
		console.log(this.props.data);
		this.props.history.push(`/data/${this.props.data.id}`);
	};

	disconnectIntegration = async () => {
		console.log('Disconnect Clicked!');
		await this.api.deleteIntegration(this.props.data.id);
		const integrations = await this.api.listIntegrations();
		if (!integrations.error) {
			this.props.dispatch(setIntegrations(integrations));
		}
	};

	enableModalForm = () => {
		const requestType = this.getRequestType();

		this.props.dispatch(
			showModalForm(true, this.props.data.id, requestType, this.props.data.type, this.props.data.config)
		);
	};

	getRequestType = () => {
		let type;
		switch (this.props.data.status) {
			case 'NEEDS_CONFIG':
				type = 'INITIAL';
				break;
			case 'ENABLED':
				type = 'CONFIGURE';
				break;
			default:
				type = 'AUTHORIZE';
		}
		return type;
	};

	render() {
		// const {img, name, text, connected} = this.props.data;
		// const connected = false;
		const { status, display } = this.props.data;
		const { name, category, icon } = display;
		const { horizontal } = this.props;
		return (
			<>
				<div className="flex p-4 bg-white rounded-lg shadow-xs dark:bg-gray-800 border-2 dark:border-gray-700">
					<div className="mr-4 w-20 h-20 bg-white rounded-lg overflow-hidden">
						<img className="w-full h-full object-center object-cover" alt={name} src={icon} />
					</div>
					<div>
						<p className="text-lg font-semibold text-gray-700 dark:text-gray-200">
							{name.length > 10 ? name.substring(0, 9) + '...' : name}
						</p>
						<p className="pt-2 text-sm font-medium text-gray-600 dark:text-gray-400">{category}</p>
						{status && status === 'NEEDS_CONFIG' && (
							<p className="inline-flex pt-2 text-xs font-medium text-red-300">
								<ExclamationCircleIcon className="w-4 h-4 mr-1" /> Configure
							</p>
						)}
					</div>
					<div className="ml-auto">
						<div className="relative">
							{status && status === 'ENABLED' && (
								<ToggleSwitch
									getSampleData={this.getSampleData}
									disconnectIntegration={this.disconnectIntegration}
									name={name}
								/>
							)}
							{status && status === 'NEEDS_CONFIG' && (
								<ToggleSwitch
									getSampleData={this.getSampleData}
									disconnectIntegration={this.disconnectIntegration}
									name={name}
								/>
							)}
							{!status && (
								<button
									onClick={this.getAuthorizeRequirements}
									className="px-3 py-2 text-sm font-medium leading-5 text-center text-white transition-colors duration-150 bg-purple-600 border border-transparent rounded-lg active:bg-purple-600 hover:bg-purple-700 focus:outline-none focus:shadow-outline-purple"
								>
									Connect
								</button>
							)}
						</div>
					</div>
				</div>
			</>
		);
	}
}

function mapStateToProps({ auth, integrations }) {
	console.log(`integrations: ${JSON.stringify(integrations)}`);
	return {
		authToken: auth.token,
		integrations,
	};
}

export default withRouter(connect(mapStateToProps)(Integration));
