import React, { Component } from 'react';
import { connect } from 'react-redux';
import { Button } from 'react-bootstrap';
import IntegrationList from './IntegrationList';
import ModalForm from './ModalForm';
import { showModalForm } from '../actions/modalForm';

// this component is an example landing page for the application
class Dashboard extends Component {
    constructor(props) {
        super(props);

        this.state = {
            // ... component state may or may not be used
        };
    }

    componentDidMount() {
        const jwt = this.props.authToken || sessionStorage.getItem('jwt');
        if (!jwt) {
            // you must be logged
            this.props.history.push('/logout');
        }
    }

    enableModalForm = () => {
        this.props.dispatch(showModalForm(true));
    };

    render() {
        return (
            <div className="container">
                <Button onClick={this.enableModalForm}>
                    {' '}
                    Show ModalForm.js{' '}
                </Button>
                <ModalForm />

                <div id="card-wrap" className="card">
                    <div className="card-body">
                        <IntegrationList />
                    </div>
                </div>

                {/* <div id='card-wrap' className='card'> */}
                {/*    <div className='card-body'> */}
                {/*        <h2>this.props.authToken: {this.props.authToken}</h2> */}

                {/*    </div> */}
                {/* </div> */}

                {/* <div id='card-wrap' className='card'> */}
                {/*    <div className='card-body'> */}
                {/*        <h2> Note this "authToken" is set via this code in login() in Login.js
                component: </h2> */}
                {/*        <p>let token = 'someauthtoken';</p> */}
                {/*        <p>this.props.dispatch(setAuthToken(token));</p> */}

                {/*    </div> */}
                {/* </div> */}
            </div>
        );
    }
}

// this function defines which of the redux store items we want,
// and the return value returns them as props to our component
function mapStateToProps({ auth }) {
    return {
        authToken: auth.token,
    };
}

// connects this component to the redux store.
export default connect(mapStateToProps)(Dashboard);
