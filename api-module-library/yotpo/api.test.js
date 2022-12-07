'use strict';
const chai = require('chai');
const should = chai.should();
const { Api } = require('./api');
const { expect } = require('chai');
const nock = require('nock');

describe('Yotpo core API class', () => {
  const api = new Api({
    secret: 'secret',
    store_id: 'vwxyz',
  });

  describe('Order Fulfillments', () => {
    it('should create an order fulfillment', async () => {
        api.API_KEY_VALUE = 'abcdefghijk';
        const createOrderFulfillmentResponse = require('');
        let createOrderFulfillmentCall;
        let result;
        let requestBody = {
            fulfillment: {
              external_id: "56789",
              fulfillment_date: "2023-03-31T11:58:51Z",
              status: "pending",
              fulfilled_items: [
                {
                  external_product_id: "012345",
                  quantity: 1
                }
              ]
            }
          }


        createOrderFulfillmentCall = nock('https://api.yotpo.com/core')
        .post(`/v3/stores/${api.store_id}/orders/vwxyz/fulfillments`, (body) => {
            requestBody = body;
            return requestBody
        })
        .reply(200, createOrderFulfillmentResponse);

        result = await api.createOrderFulfillment(requestBody, '1234')

        it('calls the expected endpoint', () => {
            expect(createOrderFulfillmentCall.isDone()).to.be.true;
        })
    })
  })
});
