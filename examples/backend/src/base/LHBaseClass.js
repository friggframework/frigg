const { RequiredPropertyError, ParameterTypeError } = require('../errors/ValidationErrors');

class LHBaseClass {
	constructor(params) {
		// ...
	}

	getParam(params, strKey, defaultValue) {
		params = params || {};

		// if the key exists, returns its value
		if (strKey in params) {
			return params[strKey];
		}

		// if the key doesnt exist in the params
		// and a default value was not specified throw error
		if (defaultValue === undefined) {
			throw new RequiredPropertyError({
				parent: this,
				key: strKey,
			});
		}

		// if we get this far, return the default value
		return defaultValue;
	}

	getParamAndVerifyType(params, strKey, classType, defaultValue) {
		const val = this.getParam(params, strKey, defaultValue);

		if (Array.isArray(val)) {
			// then check that each of the items in the array are of the classType
			for (const index in val) {
				if (
					(val[index].prototype && !(val[index].prototype instanceof classType)) ||
					(!val[index].prototype && !(val[index] instanceof classType))
				) {
					throw new ParameterTypeError({
						parent: this,
						key: `${strKey}[${index}]`,
						value: val,
						expectedType: classType.constructor,
					});
				}
			}
		} else if (
			(val.prototype && !(val.prototype instanceof classType)) ||
			(!val.prototype && !(val instanceof classType))
		) {
			throw new ParameterTypeError({
				parent: this,
				key: strKey,
				value: val,
				expectedType: classType.constructor,
			});
		}
		return val;
	}

	// TODO evaluate for service core
	getArrayParamAndVerifyParamType(params, strKey, paramType, defaultValue) {
		const val = this.getParam(params, strKey, defaultValue);

		if (Array.isArray(val)) {
			for (const index in val) {
				this.getParamAndVerifyParamType(val, index, paramType, defaultValue);
			}
		} else {
			throw new ParameterTypeError({
				parent: this,
				key: strKey,
				value: val,
				expectedType: Array,
			});
		}
		return val;
	}

	getParamAndVerifyParamType(params, strKey, paramType, defaultValue) {
		const val = this.getParam(params, strKey, defaultValue);

		if (Array.isArray(val)) {
			throw new Error(`${strKey} should not be an array`);
		}
		this.verifyType(val, paramType);
		return val;
	}

	verifyType(val, paramType) {
		if (!(typeof val === paramType)) {
			throw new ParameterTypeError({
				parent: this,
				value: val,
				expectedType: paramType,
			});
		}
	}
}

module.exports = LHBaseClass;
