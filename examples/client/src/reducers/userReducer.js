import {
    LOGIN,
    REGISTER,
    UPDATE_USER,
    LOGOUT,
  } from "../actions/types";
  
  const localSt = JSON.parse(localStorage.getItem("user"));
  const initialState = localSt ? localSt : {};
  
  const user = (state = initialState, action) => {
    switch (action.type) {
      case REGISTER:
        return action.payload;
      case LOGIN:
        return action.payload;
      case UPDATE_USER:
        return {
          ...state,
          ...action.payload,
        };
      case LOGOUT:
        return {};
      default:
        return state;
    }
  };
  
  export default user;
  