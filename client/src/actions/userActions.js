import { REGISTER, LOGIN, LOGOUT, UPDATE_USER } from "./types";

import authService from "../services/authService";

export const registerUser = (payload, clearForm) => async (dispatch) => {
  const user = await authService("register", payload);

  if (user) {
    clearForm();
    dispatch({ type: REGISTER, payload: user });
    window.location = "/";
  }
};

export const loginUser = (payload, clearForm) => async (dispatch) => {
  const user = await authService("login", payload);

  if (user) {
    clearForm();
    dispatch({ type: LOGIN, payload: user });
    window.location = "/";
  }
};

export const logoutUser = () => (dispatch) => {
  localStorage.removeItem("user");

  dispatch({
    type: LOGOUT,
  });

  window.location = "/";
};


export const updateUser = (data) => async (dispatch) => {
  const user = JSON.parse(localStorage.getItem("user"));

  const updatedUser = { ...user, ...data };

  localStorage.setItem("user", JSON.stringify(updatedUser));

  dispatch({
    type: UPDATE_USER,
    payload: data,
  });
};