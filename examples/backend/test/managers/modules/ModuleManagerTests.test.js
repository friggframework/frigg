// const modules = ['Monday', 'RollWorks', 'Front', 'HubSpot', 'Huggg', 'Personio'];
const modules = ['HubSpot'];
modules.forEach((module) => {
    require(`../../../src/modules/${module}/test/Manager.test.js`);
});
