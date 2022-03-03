import React, { Component } from 'react';
import { connect } from 'react-redux';
import '../../index.css';
import FormValidator from '../FormValidator';

class TextInput extends Component {
    constructor(props) {
        super(props);
        const extraValidators = this.props.extraValidators
            ? this.props.extraValidators
            : [];
        this.type = this.props.type ? this.props.type : 'text';
        this.validator = new FormValidator([
            {
                field: this.props.name,
                method: 'isEmpty',
                validWhen: false,
                message: `${this.props.title} is required.`,
            },
            ...extraValidators,
        ]);

        this.state = {
            [this.props.name]: '',
            validation: this.validator.valid(),
        };
    }

    componentDidMount() {
        this.setState({
            [this.props.name]: document.getElementById(this.props.name).value,
        });
    }

    // when form inputs change, this method handles validating them
    handleInputChange = (event) => {
        event.preventDefault();

        this.setState(
            {
                [event.target.name]: event.target.value,
            },
            () => {
                const validation = this.validator.validate(this.state);
                this.props.isValid(
                    this.props.name,
                    !validation[this.props.name].isInvalid &&
                        this.state[this.props.name].length !== 0
                );
            }
        );
    };

    render() {
        const validation = this.validator.validate(this.state);

        return (
            <div>
                <p>
                    <div
                        className={
                            this.state[this.props.name].length === 0 &&
                            validation[this.props.name].isInvalid &&
                            'has-error'
                        }
                    >
                        <label> {this.props.title}</label>
                        <input
                            type={this.type}
                            id={this.props.name}
                            name={this.props.name}
                            placeholder={this.props.placeholder}
                            required
                            onChange={this.handleInputChange}
                            value={this.props.value}
                        />

                        {this.state[this.props.name].length === 0 && (
                            <i>
                                <span></span>
                                <span></span>
                            </i>
                        )}
                        {this.state[this.props.name].length !== 0 &&
                            validation[this.props.name].isInvalid && (
                                <i className="invalid-form">
                                    <span></span>
                                    <span></span>
                                </i>
                            )}

                        {this.state[this.props.name].length !== 0 &&
                            !validation[this.props.name].isInvalid && (
                                <i className="valid-form">
                                    <span></span>
                                    <span></span>
                                </i>
                            )}
                        {this.state[this.props.name].length !== 0 && (
                            <span className="help-block">
                                {validation[this.props.name].message}
                            </span>
                        )}
                    </div>
                </p>
            </div>
        );
    }
}

export default connect()(TextInput);
