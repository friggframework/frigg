import validator from 'validator';

// use primarily for form validation
export default class FormValidator {
    constructor(validations) {
        // validations is an array of rules specific to a form
        this.validations = validations;
    }

    validate(state) {
        // start out assuming valid
        const validation = this.valid(); // for each validation rule
        this.validations.forEach((rule) => {
            // if the field isn't already marked invalid by an earlier rule
            if (!validation[rule.field].isInvalid) {
                // determine the field value, the method to invoke and
                // optional args from the rule definition
                const fieldValue = state[rule.field].toString();
                const args = rule.args || [];
                const validationMethod =
                    typeof rule.method === 'string'
                        ? validator[rule.method]
                        : rule.method;

                // call the validationMethod with the current field value
                // as the first argument, any additional arguments, and the
                // whole state as a final argument.  If the result doesn't
                // match the rule.validWhen property, then modify the
                // validation object for the field and set the isValid
                // field to false
                if (
                    validationMethod(fieldValue, ...args, state) !==
                    rule.validWhen
                ) {
                    validation[rule.field] = {
                        isInvalid: true,
                        message: rule.message,
                    };
                    validation.isValid = false;
                }
            }
        });
        return validation;
    }

    // create a validation object for a valid form
    valid() {
        const validation = {};

        this.validations.forEach((rule) => {
            validation[rule.field] = { isInvalid: false, message: '' };
        });

        return { isValid: true, ...validation };
    }
}
