import React, { Component } from 'react';
import { connect } from 'react-redux';
import Row from 'react-bootstrap/Row';
import Integration from './Integration';
import { setIntegrations } from '../actions/integrations';
import IntegrationUtils from '../utils/IntegrationUtils';
import API from '../api/api';
import { logoutUser } from '../actions/logout';
import { setAuthToken } from '../actions/auth';

class IntegrationList extends Component {
    constructor(props) {
        super(props);

        this.state = {
            // ... component state may or may not be used
        };
    }

    async componentDidMount() {
        const jwt = sessionStorage.getItem('jwt');
        if (jwt !== this.props.authToken) {
            await this.props.dispatch(setAuthToken(jwt));
        }

        if (this.props.authToken) {
            const api = new API();

            api.setJwt(this.props.authToken);

            const integrations = await api.listIntegrations();

            if (integrations.error) this.props.dispatch(logoutUser());

            this.props.dispatch(setIntegrations(integrations));
        }
    }

    // renderIntegrations(){
    //     // return this.props.integrations.map((integration) => {
    //     //     return <Integration data={integration} />
    //     // })
    //
    //     // This just to test vertical or horizontal
    //     let horizontal = true;
    //     if(horizontal){
    //         return INTEGRATIONS.map((integration) => {
    //             return <Integration data={integration} horizontal={horizontal} />
    //         });
    //     }else{
    //         return <Row className='integration-list-row-parent centered'>
    //                     {INTEGRATIONS.map((integration) => (
    //                         <Integration data={integration} horizontal={horizontal} />
    //                     ))}
    //                 </Row>
    //     }
    // }
    renderCombinedIntegrations(combinedIntegrations) {
        const horizontal = true;
        if (horizontal) {
            return combinedIntegrations.map((integration) => (
                <Integration
                    data={integration}
                    horizontal={horizontal}
                    key={`combined-integration-${integration.type}`}
                />
            ));
        }
        return (
            <Row className="integration-list-row-parent centered">
                {combinedIntegrations.map((integration) => (
                    <Integration data={integration} horizontal={horizontal} />
                ))}
            </Row>
        );
    }

    renderPossibleIntegrations(possibleIntegrations) {
        // This just to test vertical or horizontal
        const horizontal = true;
        if (horizontal) {
            return possibleIntegrations.map((integration) => (
                <Integration
                    data={integration}
                    horizontal={horizontal}
                    key={`possible-integration-${integration.type}`}
                />
            ));
        }
        return (
            <Row className="integration-list-row-parent centered">
                {possibleIntegrations.map((integration) => (
                    <Integration data={integration} horizontal={horizontal} />
                ))}
            </Row>
        );
    }

    renderActiveIntegrations(activeIntegrations) {
        // This just to test vertical or horizontal
        const horizontal = true;
        if (horizontal) {
            return activeIntegrations.map((integration) => (
                <Integration
                    data={integration}
                    horizontal={horizontal}
                    key={`active-integration-${integration.type}`}
                />
            ));
        }
        return (
            <Row className="integration-list-row-parent centered">
                {activeIntegrations.map((integration) => (
                    <Integration data={integration} horizontal={horizontal} />
                ))}
            </Row>
        );
    }

    render() {
        // console.log(JSON.stringify(this.props.integrations));

        let integrationUtils = null;
        if (this.props.integrations) {
            integrationUtils = new IntegrationUtils(
                this.props.integrations.integrations
            );
            console.log(integrationUtils.getPrimaryType());
            integrationUtils.getPossibleIntegrations();
        }

        return (
            <div className="integration-list">
                {integrationUtils !== null &&
                    this.renderCombinedIntegrations(
                        integrationUtils.getActiveAndPossibleIntegrationsCombined()
                    )}

                {/* {integrationUtils !== null && */}
                {/*    <Fragment> */}
                {/*        <h2>Primary: {integrationUtils.getPrimaryType()}</h2> */}

                {/*        <br/><br/> */}
                {/*        <h3>integrationUtils.getPossibleIntegrations():</h3> */}
                {/*        /!*{integrationUtils.getPossibleIntegrations().map( (possibleIntegration) => {*!/ */}
                {/*        /!*    return <h1>{possibleIntegration.type}</h1>*!/ */}
                {/*        /!*} )}*!/ */}

                {/*        {this.renderPossibleIntegrations(integrationUtils.getPossibleIntegrations())} */}

                {/*        <br/><br/> */}
                {/*        <h3>integrationUtils.getActiveIntegrations():</h3> */}
                {/*        /!*{this.renderActiveIntegrations(integrationUtils.getActiveIntegrations())}*!/ */}

                {/*        {this.renderActiveIntegrations(integrationUtils.getActiveIntegrations())} */}

                {/*        <br/><br/><br/><br/> */}
                {/*        <div>{JSON.stringify(integrationUtils.getActiveIntegrations())}</div> */}

                {/*        <br/><br/> */}
                {/*        <h3>authorized entities:</h3> */}
                {/*        <div>{JSON.stringify(integrationUtils.getAuthorizedEntities())}</div> */}

                {/*        <br/><br/> */}
                {/*        <h3>internal integrations data from /api/integrations:</h3> */}
                {/*        <div>{JSON.stringify(this.props.integrations)}</div> */}
                {/*    </Fragment>} */}
            </div>
        );
    }
}

// we want this component to have access to the integrations in redux
function mapStateToProps({ auth, integrations }) {
    return {
        authToken: auth.token,
        integrations,
    };
}

// connect this component to the redux store
export default connect(mapStateToProps)(IntegrationList);
