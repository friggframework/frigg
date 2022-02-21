import { USER_LOGOUT } from '../actions/logout';

// reducer to handling updading the auth items into the redux store
export function logout(state = {}, action) {
    const newState = { ...state };
    switch (action.type) {
        case USER_LOGOUT:
            return newState;
        default:
            return state;
    }
}
