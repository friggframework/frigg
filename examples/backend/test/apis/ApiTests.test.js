// const modules = ['Monday', 'RollWorks', 'Front', 'HubSpot', 'Huggg', 'Personio'];
const modules = ['Terminus', 'Crossbeam', 'HubSpot', 'Attentive'];
modules.forEach((module) => {
	require(`../../src/modules/${module}/test/Api.test.js`);
});
