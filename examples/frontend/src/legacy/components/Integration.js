import React, { Component } from 'react';
import Col from 'react-bootstrap/Col';
import Row from 'react-bootstrap/Row';
import Image from 'react-bootstrap/Image';
import Button from 'react-bootstrap/Button';
import { Link, withRouter } from 'react-router-dom';
import { connect } from 'react-redux';
import API from '../api/api';
import { showModalForm } from '../actions/modalForm';
import { setIntegrations } from '../actions/integrations';

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
			<Col md={horizontal ? 12 : 4} sm={horizontal ? 12 : 6}>
				{horizontal ? (
					<Row className="integration-row">
						<Col className="integration-col-left">
							<Image src={icon} className="mx-auto d-block" height={125} width={125} />
						</Col>

						<Col md={8} className="integration-col-middle">
							<p className="integration-name font-weight-bold">{name}</p>

							<p className="integration-text">{category}</p>
						</Col>

						<Col className="integration-col-right">
							{status && status === 'ENABLED' && (
								<div className="integration-connected-portal">
									<label className="text-secondary integration-connected">Connected!</label>
									<br />

									<Link className="integration-disconnect-link" onClick={this.disconnectIntegration}>
										Disconnect?
									</Link>
									<Button onClick={this.enableModalForm} className={'integration-center-button-btn'}>
										Configure
									</Button>
								</div>
							)}
							{status && status === 'NEEDS_CONFIG' && (
								<div className="integration-connected-portal">
									<label className="text-secondary integration-connected">Needs Setup!</label>
									<br />

									<Link className="integration-disconnect-link" onClick={this.disconnectIntegration}>
										Disconnect?
									</Link>

									<Button onClick={this.getSampleData}>Get Sample Data</Button>

									<Button onClick={this.enableModalForm} className={'integration-center-button-btn'}>
										Configure
									</Button>
								</div>
							)}

							{status && status === 'PROCESSING' && (
								<div className="integration-connected-portal">
									<label className="text-secondary integration-processing integration-connected">Processing</label>
									<br />

									<Link className="integration-disconnect-link" onClick={this.disconnectIntegration}>
										Disconnect?
									</Link>

									<Button onClick={this.enableModalForm} className={'integration-center-button-btn'} disabled>
										Configure
									</Button>
								</div>
							)}
							{!status && (
								<div className="integration-options-div">
									<Button
										onClick={this.getAuthorizeRequirements}
										className="integration-center-button-btn"
										variant="primary"
									>
										Connect
									</Button>

									<Link to="#" className="integration-details-link">
										Details
									</Link>
								</div>
							)}
						</Col>
					</Row>
				) : (
					<Col md={12} className="h-100 integration-col-parent">
						<Row className="integration-row1-vertical">
							<Image src={icon} className="mx-auto d-block integration-img-vertical" height={125} width={125} />
						</Row>
						<Row className="integration-row2-vertical">
							<p className="integration-name font-weight-bold">{name}</p>
							<p className="integration-text">{category}</p>
						</Row>
						<Row className="integration-row3-vertical">
							{status && <label className="text-secondary integration-connected-vertical">Connected!</label>}
							{!status && (
								<div className="integration-options-div-vertical">
									<Link to="#" className="integration-details-link-vertical">
										Details
									</Link>
									<Button className="integration-connect-button-vertical" variant="primary">
										Connect
									</Button>
								</div>
							)}
						</Row>
					</Col>
				)}
			</Col>
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
