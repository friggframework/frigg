const { get, Requester } = require('@friggframework/core');
const FormatPatchBody = require('./formatPatchBody');

class Api extends Requester {
    constructor(params) {
        super(params);
        this.company_id = get(params, 'company_id', null);
        this.public_key = get(params, 'public_key', null);
        this.private_key = get(params, 'private_key', null);
        this.client_id = get(params, 'client_id', null);
        // Will need to implement site into API requests
        this.site = get(params, 'site', null);
        this.setup();
    }

    setup() {
        this.site = this.site && this.cleanUrl(this.site);
        const credentials = `${this.company_id}+${this.public_key}:${this.private_key}`;
        const buff = new Buffer.from(credentials);
        this.Credentials = `Basic ${buff.toString('base64')}`
    }
    addAuthHeaders(headers) {
        const authHeaders = {
            clientId: this.client_id,
            authorization: this.Credentials,
        }
        return { ...headers, ...authHeaders }

    }
    cleanUrl(auth_site) {
        if (auth_site.indexOf('://') === -1) {
            if (
                (auth_site.indexOf('na.myconnectwise.net') > -1 &&
                    auth_site.indexOf('api-') === -1) ||
                (auth_site.indexOf('eu.myconnectwise.net') > -1 &&
                    auth_site.indexOf('api-') === -1) ||
                (auth_site.indexOf('au.myconnectwise.net') > -1 &&
                    auth_site.indexOf('api-') === -1) ||
                (auth_site.indexOf('aus.myconnectwise.net') > -1 &&
                    auth_site.indexOf('api-') === -1) ||
                (auth_site.indexOf('za.myconnectwise.net') > -1 &&
                    auth_site.indexOf('api-') === -1) ||
                (auth_site.indexOf('staging.connectwisedev.com') > -1 &&
                    auth_site.indexOf('api-') === -1)
            ) {
                auth_site = `api-${auth_site}`;
            } else {
                auth_site = auth_site;
            }
        } else {
            const auth_split = auth_site.split('://');

            auth_site = `${auth_split[0]}://${this.cleanUrl(auth_split[1])}`;
        }
        return auth_site;
    }

    async listCompanies(query) {
        const options = {
            // credentials: "include",
            // method: 'GET',
            url: `${this.site}/v4_6_release/apis/3.0/company/companies`,
            headers: {
                clientId: this.client_id,
                accept: 'application/json',
                authorization: this.Credentials,
            },
            query,
        };
        return await this._get(options);
        // let response = await fetch(encodeURI(`${this.site}/v4_6_release/apis/3.0/company/companies`), options);
        // return response.json();
    }

    async createCompany(company) {
        const options = {
            // credentials: "include",
            // method: 'POST',
            url: `${this.site}/v4_6_release/apis/3.0/company/companies`,
            headers: {
                'content-type': 'application/json',
                clientId: this.client_id,
                Accept: 'application/vnd.connectwise.com+json; version=2019.1',
                authorization: this.Credentials,
            },
            body: company,
        };
        return await this._post(options);
        // let response = await fetch(encodeURI(`${this.site}/v4_6_release/apis/3.0/company/companies`), options);
        // return response.json();
    }

    async getCompanyById(id) {
        const options = {
            // credentials: "include",
            // method: 'GET',
            url: `${this.site}/v4_6_release/apis/3.0/company/companies/${id}`,
            headers: {
                clientId: this.client_id,
                accept: 'application/json',
                authorization: this.Credentials,
            },
        };
        return await this._get(options);
        // let response = await fetch(encodeURI(`${this.site}/v4_6_release/apis/3.0/company/companies/`) + id, options);
        // return response.json();
    }

    async deleteCompanyById(id) {
        const options = {
            // credentials: "include",
            // method: 'DELETE',
            url: `${this.site}/v4_6_release/apis/3.0/company/companies/${id}`,
            headers: {
                clientId: this.client_id,
                accept: 'application/json',
                authorization: this.Credentials,
            },
        };
        return await this._delete(options);
        // let response = await fetch(encodeURI(`${this.site}/v4_6_release/apis/3.0/company/companies/`) + id, options);
        // return response;
    }

    async patchCompanyById(id, company) {
        const body = FormatPatchBody('/', company);
        const options = {
            // credentials: "include",
            // method: 'PATCH',
            url: `${this.site}/v4_6_release/apis/3.0/company/companies/${id}`,
            headers: {
                'content-type': 'application/json',
                clientId: this.client_id,
                accept: 'application/json',
                authorization: this.Credentials,
            },
            body,
        };
        return await this._patch(options);
        // let response = await fetch(encodeURI(`${this.site}/v4_6_release/apis/3.0/company/companies/`) + id, options);
        // return response.json();
    }

    async listCompanyTypes(query) {
        const options = {
            url: `${this.site}/v4_6_release/apis/3.0/company/companies/types`,
            headers: {
                clientId: this.client_id,
                accept: 'application/json',
                authorization: this.Credentials,
            },
            query,
        };
        return await this._get(options);
    }

    async listCommunicationTypes(query) {
        const options = {
            url: `${this.site}/v4_6_release/apis/3.0/company/communicationTypes`,
            headers: {
                clientId: this.client_id,
                accept: 'application/json',
                authorization: this.Credentials,
            },
            query,
        };
        return await this._get(options);
    }

    async createCompanyType(companyType) {
        const body = {
            name: companyType,
        };
        const options = {
            url: `${this.site}/v4_6_release/apis/3.0/company/companies/types`,
            headers: {
                'content-type': 'application/json',
                clientId: this.client_id,
                Accept: 'application/vnd.connectwise.com+json; version=2019.1',
                authorization: this.Credentials,
            },
            body,
        };
        return await this._post(options);
    }

    async addTypeToCompany(company_id, type_id) {
        const body = {
            type: {
                id: type_id,
            },
        };
        const options = {
            url: `${this.site}/v4_6_release/apis/3.0/company/companies/${company_id}/typeAssociations`,
            headers: {
                'content-type': 'application/json',
                clientId: this.client_id,
                Accept: 'application/vnd.connectwise.com+json; version=2019.1',
                authorization: this.Credentials,
            },
            body,
        };
        return await this._post(options);
    }

    async deleteCompanyType(id) {
        const options = {
            url: `${this.site}/v4_6_release/apis/3.0/company/companies/types/${id}`,
            headers: {
                'content-type': 'application/json',
                clientId: this.client_id,
                Accept: 'application/vnd.connectwise.com+json; version=2019.1',
                authorization: this.Credentials,
            },
        };
        return await this._delete(options);
    }

    async listCountries() {
        const options = {
            url: `${this.site}/v4_6_release/apis/3.0/company/countries?pageSize=1000`,
            headers: {
                'content-type': 'application/json',
                clientId: this.client_id,
                Accept: 'application/vnd.connectwise.com+json; version=2019.1',
                authorization: this.Credentials,
            },
        };
        return await this._get(options);
    }

    async listInvoices(query) {
        const options = {
            url: `${this.site}/v4_6_release/apis/3.0/finance/invoices`,
            headers: {
                clientId: this.client_id,
                accept: 'application/json',
                authorization: this.Credentials,
            },
            query,
        };
        return await this._get(options);
    }

    // TODO Create Invoice... Miscellaneous? Could use SOOO many more fields
    async createInvoiceForCompany(params) {
        const body = {
            type: get(params, 'type'),
            company: {
                id: get(params, 'companyId'),
            },
        };
        const options = {
            url: `${this.site}/v4_6_release/apis/3.0/finance/invoices`,
            headers: {
                'content-type': 'application/json',
                clientId: this.client_id,
                accept: 'application/json',
                authorization: this.Credentials,
            },
            body,
        };
        return await this._post(options);
    }

    async listUnitOfMeasures(query) {
        const options = {
            url: `${this.site}/v4_6_release/apis/3.0/procurement/unitOfMeasures`,
            headers: {
                clientId: this.client_id,
                accept: 'application/json',
                authorization: this.Credentials,
            },
            query,
        };
        return await this._get(options);
    }

    async listProductSubcategories(query) {
        const options = {
            url: `${this.site}/v4_6_release/apis/3.0/procurement/subcategories`,
            headers: {
                clientId: this.client_id,
                accept: 'application/json',
                authorization: this.Credentials,
            },
            query,
        };
        return await this._get(options);
    }

    async listProductCategories(query) {
        const options = {
            url: `${this.site}/v4_6_release/apis/3.0/procurement/categories`,
            headers: {
                clientId: this.client_id,
                accept: 'application/json',
                authorization: this.Credentials,
            },
            query,
        };
        return await this._get(options);
    }

    async listCatalogItems(query) {
        const options = {
            url: `${this.site}/v4_6_release/apis/3.0/procurement/catalog`,
            headers: {
                clientId: this.client_id,
                accept: 'application/json',
                authorization: this.Credentials,
            },
            query,
        };
        return await this._get(options);
    }

    async listProductTypes(query) {
        const options = {
            url: `${this.site}/v4_6_release/apis/3.0/procurement/types`,
            headers: {
                clientId: this.client_id,
                accept: 'application/json',
                authorization: this.Credentials,
            },
            query,
        };
        return await this._get(options);
    }

    async createCatalogItem(params) {
        const identifier = get(params, 'identifier');
        const description = get(params, 'description');
        const inactiveFlag = get(params, 'inactiveFlag', false);
        const subcategoryId = get(params, 'subcategoryId');
        const typeId = get(params, 'typeId');
        const productClass = get(params, 'productClass', 'NonInventory');
        const unitOfMeasureId = get(params, 'unitOfMeasureId', 1);
        const price = get(params, 'price', 0);
        const cost = get(params, 'cost', 0);
        const customerDescription = get(
            params,
            'customerDescription',
            params.description
        );
        const categoryId = get(params, 'categoryId', 'Miscellaneous');

        const body = {
            identifier,
            description,
            inactiveFlag,
            subcategory: {
                id: subcategoryId,
            },
            type: {
                id: typeId,
            },
            productClass,
            unitOfMeasure: {
                id: unitOfMeasureId,
            },
            price,
            cost,
            customerDescription,
            category: {
                id: categoryId,
            },
        };
        const options = {
            url: `${this.site}/v4_6_release/apis/3.0/procurement/catalog`,
            headers: {
                'content-type': 'application/json',
                clientId: this.client_id,
                accept: 'application/json',
                authorization: this.Credentials,
            },
            body,
        };
        return await this._post(options);
    }

    async addProductToInvoice(params) {
        const catalogItemId = get(params, 'catalogItemId', null);
        const catalogItemIdentifier = get(
            params,
            'catalogItemIdentifier',
            null
        );
        const body = {
            catalogItem: {},
            quantity: get(params, 'quantity'),
            price: get(params, 'price'),
            cost: get(params, 'cost'),
            discount: get(params, 'discount'),
            billableOption: get(params, 'billableOption', 'Billable'),
            customerDescription: get(params, 'customerDescription'),
            invoice: {
                id: get(params, 'invoiceId'),
            },
            listPrice: get(params, 'listPrice', params.price),
        };

        if (catalogItemId) {
            body.catalogItem.id = catalogItemId;
        }
        if (catalogItemIdentifier) {
            body.catalogItem.identifier = catalogItemIdentifier;
        }

        if (!catalogItemIdentifier && !catalogItemId) {
            throw new Error(
                'Either Catalog Item ID or Catalog Item Identifier is required'
            );
        }
        const options = {
            url: `${this.site}/v4_6_release/apis/3.0/procurement/products`,
            headers: {
                'content-type': 'application/json',
                clientId: this.client_id,
                accept: 'application/json',
                authorization: this.Credentials,
            },
            body,
        };
        return await this._post(options);
    }

    async createProductType(params) {
        const body = {
            name: get(params, 'name'),
        };
        const options = {
            url: `${this.site}/v4_6_release/apis/3.0/procurement/types`,
            headers: {
                'content-type': 'application/json',
                clientId: this.client_id,
                accept: 'application/json',
                authorization: this.Credentials,
            },
            body,
        };
        return await this._post(options);
    }

    async getPaymentsForInvoice(id, query) {
        const options = {
            url: `${this.site}/v4_6_release/apis/3.0/finance/invoices/${id}/payments`,
            headers: {
                clientId: this.client_id,
                accept: 'application/json',
                authorization: this.Credentials,
            },
            query,
        };
        return await this._get(options);
    }

    async createCallback(callback) {
        const options = {
            // credentials: "include",
            // method: 'POST',
            url: `${this.site}/v4_6_release/apis/3.0/system/callbacks`,
            headers: {
                'content-type': 'application/json',
                clientId: this.client_id,
                accept: 'application/json',
                authorization: this.Credentials,
            },
            body: callback,
        };
        return await this._post(options);
        // let response = await fetch(encodeURI(`${this.site}/v4_6_release/apis/3.0/system/callbacks`), options);
        // return response.json();
    }

    async listCallbacks() {
        const options = {
            // credentials: "include",
            // method: 'GET',
            url: `${this.site}/v4_6_release/apis/3.0/system/callbacks`,
            headers: {
                clientId: this.client_id,
                accept: 'application/json',
                authorization: this.Credentials,
            },
        };
        return await this._get(options);
        // let response = await fetch(encodeURI(`${this.site}/v4_6_release/apis/3.0/system/callbacks`), options);
        // return response.json();
    }

    async getCallbackId(id) {
        const options = {
            // credentials: "include",
            // method: 'GET',
            url: `${this.site}/v4_6_release/apis/3.0/system/callbacks/${id}`,
            headers: {
                clientId: this.client_id,
                accept: 'application/json',
                authorization: this.Credentials,
            },
        };
        return await this._get(options);
        // let response = await fetch(encodeURI(`${this.site}/v4_6_release/apis/3.0/system/callbacks/`) + id, options);
        // return response.json();
    }

    async deleteCallbackId(id) {
        const options = {
            // credentials: "include",
            // method: 'DELETE',
            url: `${this.site}/v4_6_release/apis/3.0/system/callbacks/${id}`,
            headers: {
                clientId: this.client_id,
                accept: 'application/json',
                authorization: this.Credentials,
            },
        };
        return await this._delete(options);
        // let response = await fetch(encodeURI(`${this.site}/v4_6_release/apis/3.0/system/callbacks/`) + id, options);
        // return response;
    }

    async listContacts(query) {
        const options = {
            // credentials: "include",
            // method: 'GET',
            url: `${this.site}/v4_6_release/apis/3.0/company/contacts`,
            headers: {
                clientId: this.client_id,
                accept: 'application/json',
                authorization: this.Credentials,
            },
            query,
        };
        return await this._get(options);
        // let response = await fetch(encodeURI(`${this.site}/v4_6_release/apis/3.0/company/contacts`), options);
        // return response.json();
    }

    async getContactbyId(id) {
        const options = {
            // credentials: "include",
            // method: 'GET',
            url: `${this.site}/v4_6_release/apis/3.0/company/contacts/${id}`,
            headers: {
                clientId: this.client_id,
                accept: 'application/json',
                authorization: this.Credentials,
            },
        };
        return await this._get(options);
        // let response = await fetch(encodeURI(`${this.site}/v4_6_release/apis/3.0/company/contacts/`) + id, options);
        // return response.json();
    }

    async createContact(contact) {
        const options = {
            // credentials: "include",
            // method: 'POST',
            url: `${this.site}/v4_6_release/apis/3.0/company/contacts`,
            headers: {
                'Content-Type': 'application/json',
                clientId: this.client_id,
                accept: '*/*',
                authorization: this.Credentials,
            },
            body: contact,
        };
        return await this._post(options);
        // let response = await fetch(encodeURI(`${this.site}/v4_6_release/apis/3.0/company/contacts`), options);
        // return response.json();
    }

    async deleteContact(id) {
        const options = {
            // credentials: "include",
            // method: 'DELETE',
            url: `${this.site}/v4_6_release/apis/3.0/company/contacts/${id}`,
            headers: {
                clientId: this.client_id,
                accept: 'application/json',
                authorization: this.Credentials,
            },
        };
        return await this._delete(options);
        // let response = await fetch(encodeURI(`${this.site}/v4_6_release/apis/3.0/company/contacts/`) + id, options);
        // return response;
    }

    async updateContact(id, contacts) {
        const body = FormatPatchBody('/', contacts);
        const options = {
            // credentials: "include",
            // method: 'PATCH',
            url: `${this.site}/v4_6_release/apis/3.0/company/contacts/${id}`,
            headers: {
                'content-type': 'application/json',
                clientId: this.client_id,
                accept: 'application/json',
                authorization: this.Credentials,
            },
            body,
        };
        return await this._patch(options);
        // let response = await fetch(encodeURI(`${this.site}/v4_6_release/apis/3.0/company/contacts/`) + id, options);
        // return response;
    }
}

module.exports = { Api };
