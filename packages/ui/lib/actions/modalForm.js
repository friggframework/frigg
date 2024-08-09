export const SHOW_MODAL_FORM = 'SHOW_MODAL_FORM';

// action to show the modal form
export function showModalForm(
    isShowing,
    integrationId,
    requestType,
    targetEntityType,
    initialFormData
) {
    return {
        type: SHOW_MODAL_FORM,
        isShowing,
        integrationId,
        requestType,
        targetEntityType,
        initialFormData,
    };
}
