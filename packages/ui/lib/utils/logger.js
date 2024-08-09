// this logger middleware function will produce grouped output to the console.
// it is applied to the middleware in the ./index.js middleware
const logger = (store) => (next) => (action) => {
    console.group(action.type);
    console.log('The action: ', action);
    const returnValue = next(action);
    console.log('The new state: ', store.getState());
    console.groupEnd();
    return returnValue;
};

export default logger;
