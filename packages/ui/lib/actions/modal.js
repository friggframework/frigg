export const SET_MODAL_PRIMARY = 'SET_MODAL_PRIMARY';

// action to show (or hide) the primary modal
export function setModalPrimary(isShowing) {
    return {
        type: SET_MODAL_PRIMARY,
        isShowing,
    };
}
