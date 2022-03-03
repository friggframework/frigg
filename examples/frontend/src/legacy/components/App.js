import { Component, Fragment, React } from 'react';
import { BrowserRouter as Router, Route } from 'react-router-dom';
import { connect } from 'react-redux';
import LoadingBar from 'react-redux-loading';
import SiteNav from './SiteNav';
import Login from './Login';
import CreateUser from './CreateUser';
import Dashboard from './Dashboard';
import Data from './Data';
import Logout from './Logout';
import AuthRedirect from './AuthRedirect';

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

                    {jwt && <SiteNav />}

                    {/* define all the routes of the app here and later use
                        <Link to='/somewhere' />    or    this.props.history.push('/somewhere')
                        to navigate around the site  */}
                    <Route path="/" exact component={Login} />
                    <Route path="/" exact component={CreateUser} />
                    <Route path="/dashboard" exact component={Dashboard} />
                    <Route path="/data/:integrationId" exact component={Data} />
                    <Route path="/logout" exact component={Logout} />
                    <Route
                        path="/redirect/:app"
                        exact
                        component={AuthRedirect}
                    />
                    {/* ... more routes go here ... */}
                    {/* <Route path='/' component={IntegrationList} /> */}
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
