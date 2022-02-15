import axios from "axios";

let token;
const user = JSON.parse(localStorage.getItem("user"));
if (user) {
  token = user.token;
}

const apiService = axios.create({
//   baseURL: process.env.REACT_APP_BACKEND_URL,
baseURL: 'http://localhost:5000/',
headers: {
    Authorization: `Bearer ${token}`,
  },
});

export default apiService;
