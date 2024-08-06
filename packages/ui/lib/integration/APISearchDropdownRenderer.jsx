import React, { useState } from 'react';
import { withJsonFormsControlProps } from '@jsonforms/react';
import TextField from '@mui/material/TextField';
import Autocomplete from '@mui/material/Autocomplete';
import CircularProgress from '@mui/material/CircularProgress';
import API from '../api/api';
import { useFormContext } from '../context/FormContext';
import { useIntegrationContext } from '../context/IntegrationContext';

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
  const api = new API();
  const jwt = sessionStorage.getItem('jwt');
  const { integrationId, userAction, entityId } = useIntegrationContext();
  const { formType } = useFormContext();
  api.setJwt(jwt);

  const customErrors = getCustomErrors(required, selectedValue, errors);
  console.log('schema', schema);
  console.log('rest:', rest);
  console.log('data', data);
  console.log('path', path);

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
        integrationId,
        formType,
        userAction,
        entityId,
        data,
      });

      setOptions(response);
    } catch (error) {
      console.error('Error fetching autocomplete options:', error);
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
      getOptionLabel={(option) => option.title || ''}
      options={options}
      loading={loading}
      onChange={(event, newValue) => {
        const value = newValue ? newValue.const : '';
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
          helperText={customErrors ?? ''}
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
    if (errors.includes('must match exactly one schema in oneOf') && !data) {
      return 'is a required property';
    }

    if (errors.includes('must match exactly one schema in oneOf') && data) {
      return '';
    }

    return errors;
  }
};
