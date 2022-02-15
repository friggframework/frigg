import React from 'react';
import { connect } from "react-redux";
import { ToastContainer } from "react-toastify";
import { ThemeProvider } from './context/ThemeContext';
import AppRouter from './AppRouter';
import Auth from "./components/Auth";
import "react-toastify/dist/ReactToastify.css";

const App = ({ user }) => {
	const loggedIn = user?.token;
	console.log(user);

	return (
		<ThemeProvider>
			<div className={ loggedIn ? "flex h-screen bg-gray-50 dark:bg-gray-900" : "bg-gray-50 dark:bg-gray-900" }>
				<ToastContainer
					autoClose={2500}
					position="top-right"
					closeButton={false}
				/>
				{loggedIn ? <AppRouter /> : <Auth />}
				
			</div>
		</ThemeProvider>
	);
}

const mapStateToProps = (state) => ({ user: state.user });

export default connect(mapStateToProps)(App);

