export const SET_AUTH_TOKEN = 'SET_AUTH_TOKEN';

// an action for setting the Bearer token once the owner has logged in
export function setAuthToken(token) {
    return {
        type: SET_AUTH_TOKEN,
        token,
    };
}
