const StringConstants = {
    credentialTypes: { hubspot: 'Hubspot' },
    entityTypes: { hubspot: 'Hubspot' },
    opportunityPushTopicName: 'OppStageChangeSR',
    opportunityPushTopicDescription: 'PushTopic used by the SalesRight integration. Captures whenever an Opportunity changes stage.',
    accountPushTopicName: 'AccUpdateSR',
    accountPushTopicDescription: 'PushTopic used by the SalesRight integration. Used to keep Accounts/Companies up to date.',

    contactPushTopicName: 'ContUpdateSR',
    contactPushTopicDescription: 'PushTopic used by the SalesRight integration. Used to keep Contacts up date.',
    ASSOCIATION_OBJECT_NAME: 'DealToQuote',
    hubspotStrings: {
        timelineEventTemplateIds: {
            contacts: {
                dealAssociation: process.env.HUBSPOT_CONTACT_TIMELINE_EVENT_TEMPLATE_ID_DEAL_ASSOCIATION,
                quoteActivity: process.env.HUBSPOT_CONTACT_TIMELINE_EVENT_TEMPLATE_ID_QUOTE_ACTIVITY,
            },
            companies: {

                dealAssociation: process.env.HUBSPOT_COMPANY_TIMELINE_EVENT_TEMPLATE_ID_DEAL_ASSOCIATION,
                quoteActivity: process.env.HUBSPOT_COMPANY_TIMELINE_EVENT_TEMPLATE_ID_QUOTE_ACTIVITY,
            },
            deals: {

                dealAssociation: process.env.HUBSPOT_DEAL_TIMELINE_EVENT_TEMPLATE_ID_DEAL_ASSOCIATION,
                quoteActivity: process.env.HUBSPOT_DEAL_TIMELINE_EVENT_TEMPLATE_ID_QUOTE_ACTIVITY,
            },
        },
    },

};

module.exports = StringConstants;
