declare module "@friggframework/encrypt" {
  import { Schema } from "mongoose";

  export function Encrypt(schema: Schema, options: any): void;
}
