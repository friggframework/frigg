import React from "react";
import { JsonForms } from "@jsonforms/react";
import { materialRenderers } from "@jsonforms/material-renderers";
import { APISearchDropdownTester } from "./customTesterFunction";
import APISearchDropdownRenderer from "./APISearchDropdownRenderer.jsx";

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
