import { SET_INTEGRATIONS } from '../actions/integrations';

// reducer to handle adding/updating integrations into redux
export function integrations(state = null, action) {
    const newState = {};
    switch (action.type) {
        case SET_INTEGRATIONS:
            newState.integrations = action.integrations;
            return newState;
        default:
            return state;
    }
}
