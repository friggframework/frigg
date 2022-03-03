import React from 'react';
import 'react-responsive-modal/styles.css';
import { Modal } from 'react-responsive-modal';
import { connect } from 'react-redux';
import Loader from 'react-loader-spinner';
import Form from '@rjsf/bootstrap-4';
import Toggle from 'react-toggle';
import { showModalForm } from '../actions/modalForm';
import { setIntegrations } from '../actions/integrations';
import API from '../api/api';
import 'react-toggle/style.css';

const styles = {
    fontFamily: 'sans-serif',
    textAlign: 'center',
};

function CustomCheckbox(props) {
    return (
        <>
            <label htmlFor="custom-checkbox">Adjacent label tag</label>
            <Toggle
                id="custom-checkbox"
                className={props.value ? 'checked' : 'unchecked'}
                onClick={() => props.onChange(!props.value)}
                defaultChecked={props.value}
            />
        </>
    );
}

const widgets = {
    CheckboxWidget: CustomCheckbox,
};

// a modal for showing a form
class ModalForm extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            showSpinner: true,
            isLoading: true,
            schema: {},
            uiSchema: {},
            formTitle: '',
            initialFormData: {},
        };
        this.initialState = {
            showSpinner: true,
            isLoading: true,
            schema: {},
            uiSchema: {},
            formTitle: '',
            initialFormData: {},
        };
        this.api = new API();
    }

    async componentDidUpdate(prevProps) {
        if (
            prevProps.requestType !== this.props.requestType &&
            this.props.requestType
        ) {
            this.api.setJwt(this.props.authToken);
            let schema;
            let uiSchema;

            const formTitle = this.getFormTitle();

            if (
                !this.props.integrationId &&
                this.props.requestType === 'AUTHORIZE'
            ) {
                const authRequirements =
                    await this.api.getAuthorizeRequirements(
                        this.props.targetEntityType,
                        'demo'
                    );
                schema = authRequirements.data.jsonSchema;
                uiSchema = authRequirements.data.uiSchema;
            }

            if (this.props.integrationId) {
                const configOptions =
                    await this.api.getIntegrationConfigOptions(
                        this.props.integrationId
                    );
                schema = configOptions.jsonSchema;
                uiSchema = configOptions.uiSchema;
            }
            let initialFormData;

            if (this.props.initialFormData) {
                initialFormData = {
                    initial_sync:
                        this.props.initialFormData?.enable?.initial_sync,
                    ongoing_sync:
                        this.props.initialFormData?.enable?.ongoing_sync,
                    miscellaneous_invoice:
                        this.props.initialFormData?.enable
                            ?.miscellaneous_invoice,
                    sync_direction:
                        this.props.initialFormData?.settings?.allSyncs
                            ?.sync_direction,
                };
            }
            this.setState({
                uiSchema,
                schema,
                isLoading: false,
                showSpinner: false,
                formTitle,
                initialFormData,
            });
        }
    }

    getFormTitle = () => {
        let title = '';
        switch (this.props.requestType) {
            case 'AUTHORIZE':
                title = 'Authorization Credentials';
                break;
            case 'INITIAL':
                title = 'Initial Setup Details';
                break;
            case 'CONFIGURE':
                title = 'Edit Your Configuration';
                break;
            default:
                title = 'Not Supposed to See Me';
        }
        return title;
    };

    // show the modal
    onOpenModal = () => {
        this.props.dispatch(showModalForm(true));
    };

    // hide the modal
    onCloseModal = () => {
        this.props.dispatch(showModalForm(false, '', '', '', {}));
        this.setState(() => this.initialState);
    };

    updateIntegration = async (data) => {
        // handle actual form submission here
        this.api.setJwt(this.props.authToken);
        let res = null;
        try {
            res = await this.api.updateIntegration(
                this.props.integrationId,
                data
            );
        } catch (e) {
            console.error(e);
            // alert('Update failed. Stuff');
        }
        return res;
    };

    authorize = async (data) => {
        // handle actual form submission here
        let res = null;

        try {
            res = await this.api.authorize(this.props.targetEntityType, data);
        } catch (e) {
            console.error(e);
            alert('Authorization failed. Incorrect username or password');
        }

        return res;
    };

    onSubmit = async (form) => {
        console.log('form submitted with', form);

        this.setState(() => ({
            showSpinner: true,
        }));

        if (this.props.requestType === 'AUTHORIZE') {
            const res = await this.authorize(form.formData);

            if (!res) {
                alert(
                    `failed to POST /api/authorize ${this.props.targetEntityType} `
                );
                return; // skip login
            }

            if (res.error) {
                alert(
                    `'failed to POST /api/authorize ${
                        this.props.targetEntityType
                    } ...  authorizeData: ${JSON.stringify(res)}`
                );
            }

            // Get entity Id for authorized CWise entity from above response
            // Create the Integration
            const initialConfig = {
                type: this.props.targetEntityType,
            };

            // const integration = await this.api.createIntegration(
            //     this.revIoEntityId,
            //     res.id, initialConfig,
            // );
            // FIXME duplicated code with AuthRedirect.js
            // TODO change, for now using the target entity twice
            const integration = await this.api.createIntegration(
                res.entity_id,
                res.entity_id,
                initialConfig
            );
            // Get API integrations, dispatch the data into redux same way as
            // componentDidMount for IntegrationList
            const refreshedIntegrations = await this.api.listIntegrations();
            if (!refreshedIntegrations.error) {
                this.props.dispatch(setIntegrations(refreshedIntegrations));
            }

            if (integration.status === 'ENABLED') {
                // close this modal immediately
            } else if (integration.status === 'NEEDS_CONFIG') {
                // Need to do something I think
            }

            this.onCloseModal();
        }

        if (
            this.props.requestType === 'INITIAL' ||
            this.props.requestType === 'CONFIGURE'
        ) {
            console.log(JSON.stringify(form.formData));
            const config = {
                enable: {
                    initial_sync: form.formData.initial_sync,
                    ongoing_sync: form.formData.ongoing_sync,
                    miscellaneous_invoice: form.formData.miscellaneous_invoice,
                },
                settings: {
                    allSyncs: {
                        sync_direction: form.formData.sync_direction,
                    },
                },
            };
            const res = await this.updateIntegration(config);

            if (!res) {
                alert(
                    `failed to PATCH /api/integrations ${this.props.targetEntityType} `
                );
                return; // skip login
            }
            if (res.error) {
                alert(
                    `'failed to PATH /api/integrations ${
                        this.props.targetEntityType
                    } ...  authorizeData: ${JSON.stringify(res)}`
                );
            }

            // Get entity Id for authorized CWise entity from above response
            // Create the Integration

            // Get API integrations, dispatch the data into redux same way as
            // componentDidMount for IntegrationList
            const refreshedIntegrations = await this.api.listIntegrations();
            if (!refreshedIntegrations.error) {
                this.props.dispatch(setIntegrations(refreshedIntegrations));
            }

            this.onCloseModal();
        }

        // or hack a timeout to demonstrate the modal

        // setTimeout( () => { this.onCloseModal() }, 2500); // spoof an api call
    };

    render() {
        const { isShowing } = this.props;

        if (isShowing) {
            // Do nothing
        }

        return (
            <div style={styles}>
                <Modal open={isShowing} onClose={this.onCloseModal}>
                    {this.state.showSpinner && (
                        <h2>
                            <Loader
                                type="Oval"
                                color="#7149ab"
                                height={50}
                                width={50}
                                timeout={1000 * 999}
                            />
                        </h2>
                    )}
                    <br />
                    {!this.state.isLoading && (
                        <>
                            <h2>{this.state.formTitle}</h2>

                            <Form
                                schema={this.state.schema}
                                uiSchema={this.state.uiSchema}
                                onSubmit={this.onSubmit}
                                className={'modal-form'}
                                widgets={widgets}
                                formData={this.state.initialFormData}
                            >
                                {!this.state.showSpinner && (
                                    <div>
                                        <input
                                            type="submit"
                                            id="modal-submit"
                                            value="Submit This Form"
                                        />
                                    </div>
                                )}
                                {this.state.showSpinner && (
                                    <div>
                                        <input
                                            type="submit"
                                            id="modal-submit"
                                            value="Submit This Form"
                                            disabled
                                        />
                                    </div>
                                )}
                            </Form>
                        </>
                    )}
                </Modal>
            </div>
        );
    }
}

// this function defines which of the redux store items we want,
// and the return value returns them as props to our component
function mapStateToProps({ modalForm, integrations, auth }) {
    return {
        isShowing: modalForm.isShowing,
        requestType: modalForm.requestType,
        targetEntityType: modalForm.targetEntityType,
        integrationId: modalForm.integrationId,
        initialFormData: modalForm.initialFormData,
        integrations,
        authToken: auth.token,
    };
}

// connects this component to the redux store.
export default connect(mapStateToProps)(ModalForm);
