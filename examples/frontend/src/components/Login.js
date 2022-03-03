import React, { Component } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import { connect } from 'react-redux';
import serializeForm from 'form-serialize';
import FormValidator from './FormValidator';
import API from '../api/api';
import { setAuthToken } from '../actions/auth';
import { CloudIcon } from '@heroicons/react/solid';

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
		if (!username || !password) {
			return toast.error('Please fill in all the fields');
		}

		const api = new API();

		try {
			const data = await api.login(username, password);

			if (data.token) {
				const { token } = data;
				sessionStorage.setItem('jwt', token);
				this.props.dispatch(setAuthToken(token)); // dispatch the auth token to the store
				this.props.history.push('/dashboard');
			} else {
				return toast.error(`Failed to login using this base url: ${process.env.REACT_APP_API_BASE_URL}`);
			}
		} catch (e) {
			return toast.error('Login failed. Incorrect username or password');
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
			<div className="h-screen relative flex flex-col justify-center items-center">
				<div className="bg-white rounded-lg shadow-xl dark:bg-gray-800 p-12 w-[420px]">
					<h1 className="text-3xl font-semibold text-purple-600 dark:text-green-500 inline-flex">
						<CloudIcon className="w-9 h-9" />
						<span className="ml-2">Big SaaS</span>
					</h1>

					<form className="my-10" onSubmit={this.handleFormSubmit}>
						<h3 className="text-xl mb-4 text-l font-semibold text-gray-700 dark:text-gray-200">Login</h3>

						<div className="relative mb-2">
							<label className="block text-sm">
								<span className="text-gray-700 dark:text-gray-400">Email</span>
								<input
									className="block w-full mt-1 text-sm dark:border-gray-600 dark:bg-gray-700 dark:focus:ring-green-400 dark:text-gray-300 form-input rounded-lg"
									type="text"
									id="username"
									name="username"
									placeholder="Email"
									onChange={this.handleInputChange}
								/>
							</label>
							<label className="block mt-4 text-sm">
								<span className="text-gray-700 dark:text-gray-400">Password</span>
								<input
									className="block w-full mt-1 text-sm dark:border-gray-600 dark:bg-gray-700 dark:focus:ring-green-400 dark:text-gray-300 form-input rounded-lg"
									type="password"
									name="password"
									placeholder="***************"
									onChange={this.handleInputChange}
								/>
							</label>

							<button
								type="submit"
								className="block w-full px-4 py-2 mt-8 text-sm font-medium leading-5 text-center text-white transition-colors duration-150 bg-purple-600 border border-transparent rounded-lg active:bg-purple-600 hover:bg-purple-700 focus:outline-none focus:shadow-outline-purple"
							>
								Log in
							</button>

							<p className="mt-8">
								<span className="text-sm font-medium text-purple-800 dark:text-green-500 hover:underline cursor-pointer">
									Forgot your password?
								</span>
							</p>
							<p className="mt-1">
								<Link
									className="text-sm font-medium text-purple-800 dark:text-green-500 hover:underline cursor-pointer"
									to="/register"
								>
									Create account
								</Link>
							</p>
						</div>
					</form>
				</div>
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
