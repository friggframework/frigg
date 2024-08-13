import { useState } from "react";
import { withJsonFormsControlProps } from "@jsonforms/react";
import TextField from "@mui/material/TextField";
import Autocomplete from "@mui/material/Autocomplete";
import CircularProgress from "@mui/material/CircularProgress";
import API from "../api/api";

/**
 * APISearchDropdownRenderer Component
 *
 * This component renders an Autocomplete dropdown that fetches options from an API
 * based on user input. It is designed to work with JSONForms to render a form control
 * with dynamic data fetching.
 *
 * @component
 * @example
 * // Example usage:
 * <APISearchDropdownRenderer
 *   data={{ name: 'John Doe' }}
 *   handleChange={handleChangeFunction}
 *   path="searchKey"
 *   schema={{
 *     baseUrl: 'https://api.example.com',
 *     endpoint: '/search',
 *     jwt: 'your-jwt-token',
 *     asyncRefresh: true,
 *     oneOf: [
 *       { const: 'option1', title: 'Option 1' },
 *       { const: 'option2', title: 'Option 2' }
 *     ]
 *   }}
 *   errors={[]}
 *   required={true}
 * />
 *
 * @param {object} props - The properties passed to the component.
 * @param {object} props.data - The current data object for the form.
 * @param {Function} props.handleChange - Function to call when the input value changes.
 * @param {string} props.path - The path in the data object where the value should be stored.
 * @param {object} props.schema - The schema defining the structure and validation of the input.
 * @param {string} props.schema.asyncRefresh - In order to JSONForms use this component to automatically fetch options, we have to set this to true.
 * @param {string} props.schema.baseUrl - The base URL for the API request.
 * @param {string} props.schema.endpoint - The API endpoint to fetch options from.
 * @param {string} props.schema.jwt - The JWT token for authenticating API requests.
 * @param {Array<object>} [props.schema.oneOf] - Predefined options for the dropdown.
 * @param {string} props.schema.oneOf[].const - The value of the option.
 * @param {string} props.schema.oneOf[].title - The display title of the option.
 * @param {Array<string>} props.errors - The list of validation errors.
 * @param {boolean} props.required - Whether the field is required.
 *
 */
const APISearchDropdownRenderer = ({
  data,
  handleChange,
  path,
  schema,
  errors,
  required,
  ...rest
}) => {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState(schema.oneOf ?? []);
  const [selectedValue, setSelectedValue] = useState(data?.[path]);
  const [loading, setLoading] = useState(false);
  const api = new API(schema.baseUrl, schema.jwt);

  const customErrors = getCustomErrors(required, selectedValue, errors);

  // Debounce helper to minimize requests while typing
  const debounce = (func, wait) => {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  };

  const fetchOptions = async (searchValue) => {
    if (!searchValue) return;
    setLoading(true);
    try {
      const data = {
        [path]: searchValue,
      };
      const response = await api.refreshOptions({
        endpoint: schema.endpoint,
        data,
      });

      setOptions(response);
    } catch (error) {
      console.error("Error fetching autocomplete options:", error);
      setOptions(schema.oneOf);
    } finally {
      setLoading(false);
    }
  };

  const debouncedFetchOptions = debounce(fetchOptions, 500);

  return (
    <Autocomplete
      open={open}
      onOpen={() => setOpen(true)}
      onClose={() => setOpen(false)}
      getOptionSelected={(option, value) => option.const === value.const}
      getOptionLabel={(option) => option.title || ""}
      options={options}
      loading={loading}
      onChange={(event, newValue) => {
        const value = newValue ? newValue.const : "";
        handleChange(path, value);
        setSelectedValue(value);
        if (newValue === null) {
          setOptions(schema.oneOf);
        }
      }}
      onInputChange={(event, newInputValue) => {
        debouncedFetchOptions(newInputValue);
      }}
      inputValue={data?.[path]}
      renderInput={(params) => (
        <TextField
          {...params}
          label={schema.title}
          variant="outlined"
          InputProps={{
            ...params.InputProps,
            endAdornment: (
              <>
                {loading ? (
                  <CircularProgress color="inherit" size={20} />
                ) : null}
                {params.InputProps.endAdornment}
              </>
            ),
          }}
          error={!!customErrors}
          helperText={customErrors ?? ""}
        />
      )}
    />
  );
};

export default withJsonFormsControlProps(APISearchDropdownRenderer);

/**
 * We can ignore native validation since we are injecting new options straight into the autocomplete component as options
 */
const getCustomErrors = (required, data, errors) => {
  if (required) {
    if (errors.includes("must match exactly one schema in oneOf") && !data) {
      return "is a required property";
    }

    if (errors.includes("must match exactly one schema in oneOf") && data) {
      return "";
    }

    return errors;
  }
};
