import React from "react";
import { JsonForms } from "@jsonforms/react";
import { materialRenderers } from "@jsonforms/material-renderers";
import { APISearchDropdownTester } from "./customTesterFunction";
import APISearchDropdownRenderer from "./APISearchDropdownRenderer.jsx";

//todo: we need to pass the APISearch URL as a prop to replace formType property in the APISearchDropdownRenderer
export const Form = ({ schema, uiSchema, data, onChange, renderers }) => {
  return (
    <JsonForms
      schema={schema}
      uiSchema={uiSchema}
      data={data}
      renderers={[
        ...materialRenderers,
        {
          tester: APISearchDropdownTester,
          renderer: APISearchDropdownRenderer,
        },
        ...(Array.isArray(renderers) ? renderers : []),
      ]}
      onChange={onChange}
    />
  );
};
