import React from "react";
import { toast } from "react-toastify";
import { connect } from "react-redux";
import useInput from "../hooks/useInput";
import { loginUser } from "../actions/userActions.js";
import { CloudIcon } from '@heroicons/react/solid';

const Login = ({ register, loginUser }) => {
  const email = useInput("");
  const password = useInput("");

  const handleLogin = (e) => {
    e.preventDefault();

    if (!email.value.trim() || !password.value.trim()) {
      return toast.error("Please fill in all the fields");
    }

    const payload = {
      email: email.value,
      password: password.value,
    };

    const clearForm = () => {
      email.setValue("");
      password.setValue("");
    };

    loginUser(payload, clearForm);
  };

  return (


<div className="h-screen relative flex flex-col justify-center items-center">
    <div className="bg-white rounded-lg shadow-xl dark:bg-gray-800 p-12 w-[420px]" >

        <h1 className="text-3xl font-semibold text-purple-600 dark:text-green-500 inline-flex">
          <CloudIcon className="w-9 h-9" /><span className="ml-2">Big SaaS</span>
        </h1>

        <form className="my-10" onSubmit={handleLogin}>

        <h3 className="text-xl mb-4 text-l font-semibold text-gray-700 dark:text-gray-200">
          Login
        </h3>
        
            <div className="relative mb-2">
                <label className="block text-sm">
                    <span className="text-gray-700 dark:text-gray-400">Email</span>
                    <input
                        className="block w-full mt-1 text-sm dark:border-gray-600 dark:bg-gray-700 dark:focus:ring-green-400 dark:text-gray-300 form-input rounded-lg"
                        placeholder="Email" 
                        value={email.value}
                        onChange={email.onChange}
                    />
                </label>
                <label className="block mt-4 text-sm">
                    <span className="text-gray-700 dark:text-gray-400">Password</span>
                    <input
                        className="block w-full mt-1 text-sm dark:border-gray-600 dark:bg-gray-700 dark:focus:ring-green-400 dark:text-gray-300 form-input rounded-lg"
                        placeholder="***************"
                        type="password" 
                        value={password.value}
                        onChange={password.onChange}    
                    />
                </label>

                <button
                    className="block w-full px-4 py-2 mt-8 text-sm font-medium leading-5 text-center text-white transition-colors duration-150 bg-purple-600 border border-transparent rounded-lg active:bg-purple-600 hover:bg-purple-700 focus:outline-none focus:shadow-outline-purple"
                >
                    Log in
                </button>

                <p className="mt-8">
                    <span
                        className="text-sm font-medium text-purple-800 dark:text-green-500 hover:underline cursor-pointer"
                    >
                        Forgot your password?
                    </span>
                </p>
                <p className="mt-1">
                    <span
                        className="text-sm font-medium text-purple-800 dark:text-green-500 hover:underline cursor-pointer"
                        onClick={() => register()}
                    >
                    Create account
                    </span>
                </p>
            </div>
        </form>
    </div>
</div>
  );
};

export default connect(null, { loginUser })(Login);
