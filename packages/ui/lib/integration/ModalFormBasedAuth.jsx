import Form from '@rjsf/core';
import { useState } from 'react';
import API from '../../api/api';

function ModalFormBasedAuth({ closeAuthModal, name, type, refreshIntegrations }) {
	const [isLoading, setIsLoading] = useState(true);

	const api = new API();
	async function authorize(data) {
		// handle actual form submission here
		let res = null;
		api.setJwt(sessionStorage.getItem('jwt'));

		try {
			res = await api.authorize(type, data);
		} catch (e) {
			console.error(e);
			alert('Authorization failed. Incorrect username or password');
		}

		return res;
	};

	async function onSubmit(form) {

		setIsLoading(true)

		const res = await authorize(form.formData);

		if (!res) {
			alert(
				`failed to POST /api/authorize ${this.props.targetEntityType} `
			);
			return; // skip login
		}

		if (res.error) {
			alert(
				`'failed to POST /api/authorize ${
					type
				} ...  authorizeData: ${JSON.stringify(res)}`
			);
		}

		// Get entity Id for authorized CWise entity from above response
		// Create the integration
		const initialConfig = {
			type
		};

		// const integration = await this.api.createIntegration(
		//     this.myEntityId,
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
		await refreshIntegrations();

		if (integration.status === 'ENABLED') {
			// close this modal immediately
		} else if (integration.status === 'NEEDS_CONFIG') {
			// Need to do something I think
		}

		closeAuthModal()


		// or hack a timeout to demonstrate the modal

		// setTimeout( () => { this.onCloseModal() }, 2500); // spoof an api call
	};

	function CustomFieldTemplate(props) {
		const {id, label, help, required, description, errors, children} = props;
		return (
			<label htmlFor={id} className="block text-sm mb-4">
				<span className="text-gray-700">
					{label} {required ? '*' : null}
				</span>
				{description}
				{children}
				<p className="inline-flex pt-2 text-xs font-medium text-red-300">{errors}</p>
				<p className="inline-flex pt-2 text-xs font-medium text-red-300">{help}</p>
			</label>
		);
	}

	function InputTextWidget(props) {
		return (
			<input
				type="text"
				className="block w-full mt-1 text-sm form-input rounded-lg"
				value={props.value}
				required={props.required}
				placeholder={props.placeholder}
			/>
		);
	}

	function InputPasswordWidget(props) {
		return (
			<input
				type="password"
				className="block w-full mt-1 text-sm form-input rounded-lg"
				value={props.value}
				required={props.required}
				placeholder={props.placeholder}
			/>
		);
	}

	function InputCheckboxWidget(props) {
		return (
			<>
				<label htmlFor="custom-checkbox">{props.label}</label>
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
		text: InputTextWidget,
		password: InputPasswordWidget,
		CheckboxWidget: InputCheckboxWidget,
	};

	return (
		<>
			<div className="fixed inset-0 z-30 flex items-end bg-black bg-opacity-50 sm:items-center sm:justify-center">
				<div
					className="w-full px-6 py-4 overflow-hidden bg-white rounded-t-lg sm:rounded-lg sm:m-4 sm:max-w-xl"
					role="dialog"
					id="modal"
				>
					<div className="mt-4 mb-6">
						<p className="text-lg font-semibold text-gray-700 mb-6">Authorize {name}</p>

						{isLoading ? (
							<div className="flex justify-center px-8 py-8">
								<svg className="animate-spin h-10 w-10 text-purple-400" fill="none" viewBox="0 0 24 24">
									<circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
									<path
										className="opacity-75"
										fill="currentColor"
										d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
									></path>
								</svg>
							</div>
						) : null}

						<Form schema={jsonSchema} uiSchema={uiSchema} FieldTemplate={CustomFieldTemplate} widgets={widgets}>
							<footer className="flex flex-col items-center justify-end px-6 py-3 -mx-6 -mb-4 -mt-4 space-y-4 sm:space-y-0 sm:space-x-6 sm:flex-row">
								<button
									onClick={closeAuthModal}
									className="px-3 py-2 text-xs font-medium leading-5 text-center text-gray-700 transition-colors duration-150 bg-white border border-gray-300 rounded-lg hover:bg-purple-600 focus:outline-none focus:shadow-outline-gray"
								>
									Cancel
								</button>
								<button
									onClick={onSubmit}
									className="px-3 py-2 text-xs font-medium leading-5 text-center text-white transition-colors duration-150 bg-purple-600 border border-transparent rounded-lg active:bg-purple-600 hover:bg-purple-700 focus:outline-none focus:shadow-outline-purple"
								>
									Connect
								</button>
							</footer>
						</Form>
					</div>
				</div>
			</div>
		</>
	);
}
export default ModalFormBasedAuth;
