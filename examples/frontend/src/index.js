import React from 'react';
import ReactDOM from 'react-dom';
import './index.css';
import { createStore } from 'redux';
import { Provider } from 'react-redux';
import App from './App';
import reducer from './reducers';
import middleware from './middleware';

// create the redux store with the combined reducers and the combined middleware
const store = createStore(reducer, middleware);

// provide the redux store to our entire app (if they choose to connect() to it)
ReactDOM.render(
	<Provider store={store}>
		<App />
	</Provider>,
	document.getElementById('root')
);
