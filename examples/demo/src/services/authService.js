import axios from "axios";
import apiService from "../services/apiService";
import { toast } from "react-toastify";

const authService = async (endpoint, data) => {
    // const backendUrl = process.env.REACT_APP_BACKEND_URL;
    const backendUrl = 'http://localhost:5000/api/'

    try {
      const tokenRes = await axios.post(`${backendUrl}auth/${endpoint}`, data);
      console.log(tokenRes);
      const config = {
        headers: { Authorization: `Bearer ${tokenRes.data.token}` },
      };

      const userRes = await axios.get(`${backendUrl}auth/me`, config);

      const user = { ...userRes.data.data, token: tokenRes.data.token };
  
      apiService.defaults.headers.common[
        "Authorization"
      ] = `Bearer ${tokenRes.data.token}`;
  
      localStorage.setItem("user", JSON.stringify(user));
  
      return user;
    } catch (err) {
    console.log(err);
      toast.dismiss();
      toast.error(err.response.data.message);
    }
  };

  export default authService;