import { rankWith, schemaMatches } from "@jsonforms/core";

export const APISearchDropdownTester = rankWith(
  10,
  schemaMatches((schema) => schema.hasOwnProperty("asyncRefresh"))
);
