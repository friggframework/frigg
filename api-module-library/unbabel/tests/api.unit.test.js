/**
 * @group unit-tests
 */
const { Api } = require('../api');

describe('API', () => {
  let api;
  let fetch;
  let fetchData;
  let customer_id;

  beforeEach(() => {
    fetchData = {
      headers: {
        get: jest.fn(),
      },
      text: jest.fn(),
    };
    fetch = jest.fn().mockImplementation(() => fetchData);    
    customer_id = 'any_customer_id';

    global.fetch = fetch;
    api = new Api({ customer_id, fetch });
  });

  it('should retrieve the pipelines information successfully', async () => {
    const expectedOutput = 'this is output';
    fetchData.text = jest.fn().mockResolvedValue(expectedOutput);

    const output = await api.listPipelines();

    expect(output).toBe(expectedOutput);
  });
});
