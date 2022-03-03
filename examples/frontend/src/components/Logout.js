import React, { Component } from 'react';
import { connect } from 'react-redux';
import { Redirect } from 'react-router-dom';
import { logoutUser } from '../actions/logout';

// login component is a place for a user to enter a email and password
class Logout extends Component {
	constructor(props) {
		super(props);
		this.props.dispatch(logoutUser());
	}

	render() {
		return <Redirect to={'/'} />;
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
export default connect(mapStateToProps)(Logout);
