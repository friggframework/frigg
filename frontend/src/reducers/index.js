import { combineReducers } from 'redux';
import { loadingBarReducer } from 'react-redux-loading';
import { auth } from './auth';
import { modal } from './modal';
import { integrations } from './integrations';
import { modalForm } from './modalForm';
import { logout } from './logout';

// this function combines all the application reducers into one for redux to use
const appReducer = combineReducers({
    // upon login, this will have the token
    auth,

    // helps determine if we should show modals (like when mining a transaction)
    modal,

    // the modal form
    modalForm,

    // the raw integration data
    integrations,

    // loading bar reducer
    loadingBar: loadingBarReducer,

    // logging out, everyone
    logout,
});
const rootReducer = (state, action) => {
    let newState = state;
    if (action.type === 'USER_LOGOUT') {
        newState = undefined;

        sessionStorage.clear();
        console.log(
            `User Logout called, state is ${JSON.stringify(
                newState
            )} and sessionStorage is ${JSON.stringify(sessionStorage)}`
        );
    }
    return appReducer(newState, action);
};

export default rootReducer;
