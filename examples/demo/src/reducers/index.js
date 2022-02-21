import { combineReducers } from "redux";
import userReducer from "./userReducer";
import errorReducer from "./errorReducer";

export default combineReducers({
  user: userReducer,
  errors: errorReducer
});