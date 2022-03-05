import { Component, Fragment, React } from 'react';
import { BrowserRouter as Router, Route, Redirect, Switch } from 'react-router-dom';
import { connect } from 'react-redux';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import LoadingBar from 'react-redux-loading';
import SiteNav from './components/SiteNav';
import Sidebar from './components/Sidebar';
import Login from './components/Login';
import CreateUser from './components/CreateUser';
import Dashboard from './components/Dashboard';
import Data from './components/Data';
import Logout from './components/Logout';
import AuthRedirect from './components/AuthRedirect';
import DashboardPage from './pages/DashboardPage';
import CustomersPage from './pages/CustomersPage';
import SettingsPage from './pages/SettingsPage';

// this is the main entry point of the application, and contains the Nav, Router
class App extends Component {
	state = {
		jwt: this.props.authToken || sessionStorage.getItem('jwt'),
	};

	async componentDidMount() {
		// ... anything you want to do as this component is initially displayed
		const jwt = this.props.authToken || sessionStorage.getItem('jwt');
		this.setState({ jwt });
	}

	async componentDidUpdate(prevProps) {
		if (prevProps.authToken !== this.props.authToken) {
			const jwt = this.props.authToken || sessionStorage.getItem('jwt');
			this.setState({ jwt });
		}
	}

	// render method returns jsx to be displayed by react
	render() {
		const { jwt } = this.state;
		return (
			<Router>
				<Fragment>
					{/* to show this will need a timeout method to spoof it */}
					<LoadingBar />
					<div className={jwt ? 'flex h-screen bg-gray-50 dark:bg-gray-900' : 'bg-gray-50 dark:bg-gray-900'}>
						<ToastContainer autoClose={2500} position="top-right" closeButton={false} />
						{jwt ? (
							<>
								<Sidebar />
								<div className="flex flex-col flex-1">
									<SiteNav />
									<Switch>
										<Route path="/dashboard" exact component={DashboardPage} />
										<Route path="/customers" exact component={CustomersPage} />
										<Route path="/integrations" exact component={Dashboard} />
										<Route path="/settings" exact component={SettingsPage} />
										<Route path="/data/:integrationId" exact component={Data} />
										<Route path="/redirect/:app" exact component={AuthRedirect} />
										<Route path="/logout" exact component={Logout} />
										<Redirect to="/dashboard" />
									</Switch>
								</div>
							</>
						) : (
							<>
								<Route path="/" exact component={Login} />
								<Route path="/register" exact component={CreateUser} />
								<Redirect to="/" />
							</>
						)}

						{/* define all the routes of the app here and later use
								<Link to='/somewhere' />    or    this.props.history.push('/somewhere')
								to navigate around the site  */}

						{/* ... more routes go here ... */}
						{/* <Route path='/' component={IntegrationList} /> */}
					</div>
				</Fragment>
			</Router>
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
export default connect(mapStateToProps)(App);
