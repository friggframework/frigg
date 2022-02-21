import { SET_AUTH_TOKEN } from '../actions/auth';

// reducer to handling updading the auth items into the redux store
export function auth(state = {}, action) {
    const newState = { ...state };
    switch (action.type) {
        case SET_AUTH_TOKEN:
            newState.token = action.token;
            return newState;
        default:
            return state;
    }
}
