import React, { Component } from 'react';
import { connect } from 'react-redux';
import serializeForm from 'form-serialize';
import FormValidator from './FormValidator';
import API from '../api/api';
import { setAuthToken } from '../actions/auth';

// login component is a place for a user to enter a username and password
class Login extends Component {
	constructor(props) {
		super(props);

		this.validator = new FormValidator([
			{
				field: 'username',
				method: 'isEmpty',
				validWhen: false,
				message: 'Username is required.',
			},
			{
				field: 'password',
				method: 'isEmpty',
				validWhen: false,
				message: 'Password is required.',
			},
			{
				field: 'password',
				method: 'isLength',
				args: [{ min: 4 }],
				validWhen: true,
				message: 'Password must be at least 4 characters',
			},
		]);

		this.state = {
			password: '',
			username: '',
			validation: this.validator.valid(),
		};

		this.submitted = false;
	}

	componentDidMount() {
		const jwt = sessionStorage.getItem('jwt');
		if (jwt) {
			this.props.dispatch(setAuthToken(jwt)); // dispatch the auth token to the store
			this.props.history.push('/dashboard');
		}
	}

	passwordMatch = (confirmation, state) => state.password === confirmation;

	// when form inputs change, this method handles validating them
	handleInputChange = (event) => {
		event.preventDefault();

		this.setState({
			[event.target.name]: event.target.value,
		});
	};

	// call the api to login with the credentials
	login = async (username, password) => {
		// handle actual form submission here

		const api = new API();

		try {
			const data = await api.login(username, password);

			if (data.token) {
				const { token } = data;
				sessionStorage.setItem('jwt', token);
				this.props.dispatch(setAuthToken(token)); // dispatch the auth token to the store
				this.props.history.push('/dashboard');
			} else {
				alert(`failed to login using this base url: ${process.env.REACT_APP_API_BASE_URL}`);
			}
		} catch (e) {
			alert('Login failed. Incorrect username or password');
		}
	};

	// form submission method, ultimately unpacks form values and calls login method
	handleFormSubmit = async (event) => {
		event.preventDefault();

		const values = serializeForm(event.target, { hash: true });
		console.log(`values: ${JSON.stringify(values)}`);

		const validation = this.validator.validate(this.state);
		this.setState({ validation });
		this.submitted = true;

		if (validation.isValid) {
			// TODO .. idk if this works
		}

		// attempt login
		await this.login(values.username, values.password);
	};

	render() {
		const validation = this.validator.validate(this.state);

		return (
			<div id="login-form-wrap">
				<h2>Login</h2>
				<form id="login-form" onSubmit={this.handleFormSubmit}>
					<p>
						<label>Username</label>
						<input
							type="text"
							id="username"
							name="username"
							placeholder="username"
							required
							onChange={this.handleInputChange}
						/>
						{this.state.username.length === 0 && (
							<i>
								<span></span>
								<span></span>
							</i>
						)}
						{this.state.username.length !== 0 && validation.username.isInvalid && (
							<i className="invalid-form">
								<span></span>
								<span></span>
							</i>
						)}
						{this.state.username.length !== 0 && !validation.username.isInvalid && (
							<i className="valid-form">
								<span></span>
								<span></span>
							</i>
						)}
					</p>

					<p>
						<div className={this.state.password.length === 0 && validation.password.isInvalid ? 'has-error' : ''}>
							<label>Password</label>
							<input type="password" name="password" placeholder="" required onChange={this.handleInputChange} />
							{this.state.password.length === 0 && (
								<i>
									<span></span>
									<span></span>
								</i>
							)}
							{this.state.password.length !== 0 && validation.password.isInvalid && (
								<i className="invalid-form">
									<span></span>
									<span></span>
								</i>
							)}
							{this.state.password.length !== 0 && !validation.password.isInvalid && (
								<i className="valid-form">
									<span></span>
									<span></span>
								</i>
							)}
							{this.state.password.length !== 0 && <span className="help-block">{validation.password.message}</span>}
						</div>
					</p>

					<p>
						<input type="submit" id="login" value="Login" />
					</p>
				</form>
			</div>
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
export default connect(mapStateToProps)(Login);
