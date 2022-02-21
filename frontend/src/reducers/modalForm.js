import { SHOW_MODAL_FORM } from '../actions/modalForm';

// this reducer handles updating redux data/state showing the modal form
export function modalForm(state = {}, action) {
    const newState = { ...state };
    switch (action.type) {
        case SHOW_MODAL_FORM:
            newState.isShowing = action.isShowing;
            newState.requestType = action.requestType;
            newState.targetEntityType = action.targetEntityType;
            newState.integrationId = action.integrationId;
            newState.initialFormData = action.initialFormData;
            return newState;
        default:
            return state;
    }
}
