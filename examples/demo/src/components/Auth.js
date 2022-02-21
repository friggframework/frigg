import React, { useState } from "react";
import Login from "./Login";
import Register from "./Register";

const Auth = () => {
  const [auth, setAuth] = useState("LOGIN");

  const login = () => setAuth("LOGIN");
  const register = () => setAuth("REGISTER");

  if (auth === "REGISTER") {
    return <Register login={login} />;
  } else {
    return <Login register={register} />;
  }
};

export default Auth;
