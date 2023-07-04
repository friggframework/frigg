declare module "@friggframework/assertions" {
  type TypeOfType =
    | "undefined"
    | "object"
    | "boolean"
    | "number"
    | "string"
    | "function"
    | "symbol"
    | "bigint";

  export function get<TObject extends object, TKey extends string, TDefault>(
    object: TObject,
    key: TKey | undefined,
    defaultValue: Exclude<TDefault, undefined>
  ): TKey extends keyof TObject ? TObject[TKey] : TDefault;

  export function get<TObject extends object, TKey extends keyof TObject>(
    object: TObject,
    key: TKey
  ): TObject[TKey];

  export function getAll<TObject extends object, TKey extends keyof TObject>(
    object: TObject,
    requiredKeys: TKey[]
  ): Partial<TObject>;

  export function verifyType(value: unknown, paramType: TypeOfType): void;

  export function getParamAndVerifyParamType<
    TObject extends object,
    TKey extends string,
    TKeyType extends TypeOfType,
    TDefault
  >(
    params: TObject,
    key: TKey,
    type: TKeyType,
    defaultValue: TDefault
  ): TDefault;

  export function getParamAndVerifyParamType<
    TObject extends object,
    TKey extends keyof TObject,
    TKeyType extends TypeOfType
  >(params: TObject, key: TKey, type: TKeyType): TObject[TKey];

  export function getArrayParamAndVerifyParamType<
    TObject extends object,
    TKey extends string,
    TKeyType extends TypeOfType,
    TDefault
  >(
    params: TObject,
    key: TKey,
    type: TKeyType,
    defaultValue: TDefault
  ): TDefault;

  export function getArrayParamAndVerifyParamType<
    TObject extends object,
    TKey extends keyof TObject,
    TKeyType extends TypeOfType
  >(params: TObject, key: TKey, type: TKeyType): TObject[TKey];

  export function getAndVerifyType<
    TObject extends object,
    TKey extends keyof TObject,
    TClassType extends unknown
  >(object: TObject, key: TKey, classType: TClassType): TObject[TKey];

  export function getAndVerifyType<
    TObject extends object,
    TKey extends string,
    TClassType extends unknown,
    TDefault
  >(
    object: TObject,
    key: TKey,
    classType: TClassType,
    defaultValue: TDefault
  ): TKey extends keyof TObject ? TObject[TKey] : TDefault;
}
