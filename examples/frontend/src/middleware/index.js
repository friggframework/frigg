import thunk from 'redux-thunk';
import { applyMiddleware } from 'redux';
import logger from './logger';

// apply all middleware here. thunk should always be first
export default applyMiddleware(thunk, logger);
