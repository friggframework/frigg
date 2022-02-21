import { SET_MODAL_PRIMARY } from '../actions/modal';

// this reducer handles updating redux data/state related to showing modals/spinners
export function modal(state = {}, action) {
    const newState = { ...state };
    switch (action.type) {
        case SET_MODAL_PRIMARY:
            newState.isShowing = action.isShowing;
            return newState;
        default:
            return state;
    }
}
