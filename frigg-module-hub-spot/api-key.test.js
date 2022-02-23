const { Api } = require('./api');

describe.skip('HubSpot API (API Key)', () => {
    const hubSpotApi = new Api({
        backOff: [1, 3, 10],
        api_key: 'a3673629-9713-4c08-b332-f6ee7aa84147',
    });

    describe('Custom Schemas', () => {
        let obj, schema;
        beforeAll(async () => {
            const body = {
                // name: `birds${moment().format('x')}`,
                name: 'birds',
                labels: {
                    singular: 'Bird',
                    plural: 'Birds',
                },
                requiredProperties: ['species'],
                searchableProperties: ['species'],
                properties: [
                    {
                        name: 'species',
                        label: 'Species',
                        type: 'string',
                        fieldType: 'text',
                    },
                    {
                        name: 'speed',
                        label: 'Speed',
                        type: 'string',
                        // fieldType: "text"
                    },
                    {
                        name: 'frequency',
                        label: 'Frequency',
                        type: 'string',
                        // fieldType: "text"
                    },
                ],
                primaryDisplayProperty: 'species',
                secondaryDisplayProperties: [],
                associatedObjects: ['CONTACT'],
            };
            schema = await hubSpotApi.createCustomObjectSchema(body);
            schema.should.have.property('id');
            schema.should.have.property('properties');
            schema.should.have.property('createdAt');
            schema.should.have.property('updatedAt');
            schema.should.have.property('archived');
        });

        afterAll(async () => {
            let softDelete = await hubSpotApi.deleteCustomObjectSchema(
                schema.objectTypeId,
                false
            );
            let hardDelete = await hubSpotApi.deleteCustomObjectSchema(
                schema.objectTypeId,
                true
            );
            // let deleted = await hubSpotApi.deleteCustomObjectSchema(obj.objectTypeId);
            softDelete.status.should.equal(204);
            hardDelete.status.should.equal(204);
        });

        it('should create custom schema', async () => {
            //Hope the before happens
        });

        it('should delete custom schema', async () => {
            //Hope the after works
        });

        it('should get custom schema by type', async () => {
            let res = await hubSpotApi.getCustomObjectSchema(
                schema.objectTypeId
            );
            res.should.have.property('id');
            res.should.have.property('properties');
            res.should.have.property('createdAt');
            res.should.have.property('updatedAt');
            res.should.have.property('archived');
        });

        it('should list custom schemas', async () => {
            hubSpotApi.listCustomObjectSchemas();
        });

        it('should update custom schema', async () => {
            const body = {
                requiredProperties: ['species', 'speed'],
            };
            let res = await hubSpotApi.updateCustomObjectSchema(
                schema.objectTypeId,
                body
            );
            res.should.have.property('id');
            // res.should.have.property('properties');
            res.should.have.property('createdAt');
            res.should.have.property('updatedAt');
            res.should.have.property('archived');
        });

        describe('Custom Objects', () => {
            beforeAll(async () => {
                const body = {
                    properties: {
                        species: 'Eagle',
                        speed: '11',
                    },
                };
                obj = await hubSpotApi.createCustomObject(
                    schema.objectTypeId,
                    body
                );
                obj.should.have.property('id');
                obj.should.have.property('properties');
                obj.should.have.property('createdAt');
                obj.should.have.property('updatedAt');
                obj.should.have.property('archived');
            });

            afterAll(async () => {
                let deleted = await hubSpotApi.deleteCustomObject(
                    schema.objectTypeId,
                    obj.id
                );
                deleted.status.should.equal(204);
            });

            it('should create custom object', async () => {
                //Hope the before happens
            });

            it('should delete custom object', async () => {
                //Hope the after happens
            });

            it('should get custom object by ID', async () => {
                let res = await hubSpotApi.getCustomObject(
                    schema.objectTypeId,
                    obj.id
                );
                res.should.have.property('id');
                res.should.have.property('properties');
                res.should.have.property('createdAt');
                res.should.have.property('updatedAt');
                res.should.have.property('archived');
            });

            it('should list custom objects', async () => {
                await hubSpotApi.listCustomObjects(schema.objectTypeId);
            });

            it('should update a custom object', async () => {
                const body = {
                    properties: {
                        species: 'Seagul',
                        speed: '8',
                    },
                };
                let res = await hubSpotApi.updateCustomObject(
                    schema.objectTypeId,
                    obj.id,
                    body
                );
                res.should.have.property('id');
                // res.should.have.property('properties');
                res.should.have.property('createdAt');
                res.should.have.property('updatedAt');
                res.should.have.property('archived');
            });
        });
        describe('Bulk Custom Objects', () => {
            let objs;
            beforeAll(async () => {
                const body = {
                    inputs: [
                        {
                            properties: {
                                species: 'Eagle',
                                speed: '11',
                            },
                        },
                        {
                            properties: {
                                species: 'Seagull',
                                speed: '8',
                            },
                        },
                    ],
                };
                // Can use either objectTypeId, or object name
                objs = await hubSpotApi.bulkCreateCustomObjects(
                    schema.objectTypeId,
                    body
                );
                // objs = await hubSpotApi.bulkCreateCustomObjects('crossbeam_overlaps', body);
            });

            afterAll(async () => {
                const ids = objs.results.map((object) => ({ id: object.id }));
                const deleted = await hubSpotApi.bulkArchiveCustomObjects(
                    schema.objectTypeId,
                    { inputs: ids }
                );
                // deleted.status.should.equal(204);
                deleted.should.equal('');
            });

            it('should bulk create and delete custom objects', async () => {
                // Hope the befores and afters work
            });

            it('should list custom objects by species', async () => {
                const res = await hubSpotApi.listCustomObjects(
                    schema.objectTypeId,
                    { species: 'Owl', properties: 'species', limit: 1 }
                );
            });
        });
    });
});
