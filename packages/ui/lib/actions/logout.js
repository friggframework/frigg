export const USER_LOGOUT = 'USER_LOGOUT';

// an action for setting the Bearer token once the owner has logged in
export function logoutUser() {
    return {
        type: USER_LOGOUT,
    };
}
