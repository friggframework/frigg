const { get, BasicAuthRequester } = require('@friggframework/core');
const FormatPatchBody = require('./formatPatchBody');

class Api extends BasicAuthRequester {
    constructor(params) {
        super(params);
        this.company_id = get(params, 'company_id', null);
        this.public_key = get(params, 'public_key', null);
        this.private_key = get(params, 'private_key', null);
        this.client_id = get(params, 'client_id', null);
        this.site = get(params, 'site', null);
        this.setup();
    }

    setup() {
        this.site = this.site && this.cleanSiteUrl(this.site);
        this.urls = {
            companies:  `${this.site}/v4_6_release/apis/3.0/company/companies`,
            companyById: (id) => `${this.site}/v4_6_release/apis/3.0/company/companies/${id}`,
            companyTypeAssociation: (id) => `${this.site}/v4_6_release/apis/3.0/company/companies/${id}/typeAssociations`,
            communicationTypes:  `${this.site}/v4_6_release/apis/3.0/company/communicationTypes`,
            contacts:  `${this.site}/v4_6_release/apis/3.0/company/contacts`,
            contactById: (id) => `${this.site}/v4_6_release/apis/3.0/company/contacts/${id}`,
            invoices:  `${this.site}/v4_6_release/apis/3.0/finance/invoices`,
            invoicePayments: (id) => `${this.site}/v4_6_release/apis/3.0/finance/invoices/${id}/payments`,
            procurement: `${this.site}/v4_6_release/apis/3.0/procurement`,
            companyTypes: `${this.site}/v4_6_release/apis/3.0/company/companies/types`,
            countries: `${this.site}/v4_6_release/apis/3.0/company/countries`,
            callbacks: `${this.site}/v4_6_release/apis/3.0/system/callbacks`,
            callbackById: (id) => `${this.site}/v4_6_release/apis/3.0/system/callbacks/${id}`,
        }
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

    async _post(options) {
        const postHeaders = {
            'content-type': 'application/json',
            Accept: 'application/vnd.connectwise.com+json; version=2019.1',
        }
        options.headers = { ...options.headers, ...postHeaders }
        return super._post(options);
    }

    async _patch(options) {
        const patchHeaders = {
            'content-type': 'application/json',
            Accept: 'application/vnd.connectwise.com+json; version=2019.1',
        }
        options.headers = { ...options.headers, ...patchHeaders }
        return super._patch(options);
    }

    cleanSiteUrl(authSite) {
        const authSplit = authSite.split('://');
        const regionsCodes = ['na', 'eu', 'au', 'aus', 'za']
        const regions = regionsCodes.map(r => `${r}.myconnectwise.net`);
        regions.map(r => {
            if (authSplit[1].includes(r) && !(authSplit[1].includes('api-'))) {
                authSite[1] = `api-${authSplit[1]}`;
            }
        })
        return authSplit.join('://');
    }

    async listCompanies(query) {
        const options = {
            url: this.urls.companies,
            query,
        };
        return this._get(options);
    }

    async createCompany(company) {
        const options = {
            url: this.urls.companies,
            body: company,
        };
        return this._post(options);
    }

    async getCompanyById(id) {
        const options = {
            url: this.urls.companyById(id),
        };
        return this._get(options);
    }

    async deleteCompanyById(id) {
        const options = {
            url: this.urls.companyById(id),
        };
        return this._delete(options);
    }

    async patchCompanyById(id, company) {
        const body = FormatPatchBody('/', company);
        const options = {
            url: this.urls.companyById(id),
            body,
        };
        return this._patch(options);
    }

    async listCompanyTypes(query) {
        const options = {
            url: this.urls.companyTypes,
            query,
        };
        return this._get(options);
    }

    async listCommunicationTypes(query) {
        const options = {
            url: this.urls.communicationTypes,
            query,
        };
        return this._get(options);
    }

    async createCompanyType(companyType) {
        const body = {
            name: companyType,
        };
        const options = {
            url: this.urls.companyTypes,
            body,
        };
        return this._post(options);
    }

    async addTypeToCompany(company_id, type_id) {
        const body = {
            type: {
                id: type_id,
            },
        };
        const options = {
            url: this.urls.companyTypeAssociation(company_id),
            body,
        };
        return this._post(options);
    }

    async deleteCompanyType(id) {
        const options = {
            url: `${this.urls.companyTypes}/${id}`,

        };
        return this._delete(options);
    }

    async listCountries() {
        const options = {
            url: `${this.urls.countries}?pageSize=1000`,
        };
        return this._get(options);
    }

    async listInvoices(query) {
        const options = {
            url: this.urls.invoices,
            query,
        };
        return this._get(options);
    }

    async createInvoiceForCompany(params) {
        const body = {
            type: get(params, 'type'),
            company: {
                id: get(params, 'companyId'),
            },
        };
        const options = {
            url: this.urls.invoices,
            body,
        };
        return this._post(options);
    }

    async listUnitOfMeasures(query) {
        const options = {
            url: `${this.urls.procurement}/unitOfMeasures`,
            query,
        };
        return this._get(options);
    }

    async listProductSubcategories(query) {
        const options = {
            url: `${this.urls.procurement}/subcategories`,
            query,
        };
        return this._get(options);
    }

    async listProductCategories(query) {
        const options = {
            url: `${this.urls.procurement}/categories`,
            query,
        };
        return this._get(options);
    }

    async listCatalogItems(query) {
        const options = {
            url: `${this.urls.procurement}/catalog`,
            query,
        };
        return this._get(options);
    }

    async listProductTypes(query) {
        const options = {
            url: `${this.urls.procurement}/types`,
            query,
        };
        return this._get(options);
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
            url: `${this.urls.procurement}/catalog`,
            body,
        };
        return this._post(options);
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
            url: `${this.urls.procurement}/products`,
            body,
        };
        return this._post(options);
    }

    async createProductType(params) {
        const body = {
            name: get(params, 'name'),
        };
        const options = {
            url: `${this.site}/v4_6_release/apis/3.0/procurement/types`,
            body,
        };
        return this._post(options);
    }

    async getPaymentsForInvoice(id, query) {
        const options = {
            url: this.urls.invoicePayments(id),
            query,
        };
        return this._get(options);
    }

    async createCallback(callback) {
        const options = {
            url: this.urls.callbacks,
            body: callback,
        };
        return this._post(options);
    }

    async listCallbacks() {
        const options = {
            url: this.urls.callbacks,
        };
        return this._get(options);
    }

    async getCallbackId(id) {
        const options = {
            url: this.urls.callbackById(id),
        };
        return this._get(options);
    }

    async deleteCallbackId(id) {
        const options = {
            url: this.urls.callbackById(id),
        };
        return this._delete(options);
    }

    async listContacts(query) {
        const options = {
            url: this.urls.contacts,
            query,
        };
        return this._get(options);
    }

    async getContact(id) {
        const options = {
            url: this.urls.contactById(id),
        };
        return this._get(options);
    }

    async createContact(contact) {
        const options = {
            url: this.urls.contacts,
            body: contact,
        };
        return this._post(options);
    }

    async deleteContact(id) {
        const options = {
            url: this.urls.contactById(id),
        };
        return this._delete(options);
    }

    async updateContact(id, contacts) {
        const body = FormatPatchBody('/', contacts);
        const options = {
            url: this.urls.contactById(id),
            body,
        };
        return this._patch(options);
    }
}

module.exports = { Api };
