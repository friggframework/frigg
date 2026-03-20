import lodashGet from 'lodash.get';
import { RequiredPropertyError, ParameterTypeError } from '../errors';

export type TypeOfType =
    | 'undefined'
    | 'object'
    | 'boolean'
    | 'number'
    | 'string'
    | 'function'
    | 'symbol'
    | 'bigint';

export function get<TObject extends object, TKey extends string, TDefault>(
    o: TObject,
    key: TKey | undefined,
    defaultValue: Exclude<TDefault, undefined>
): TKey extends keyof TObject ? TObject[TKey] : TDefault;
export function get<TObject extends object, TKey extends keyof TObject>(
    o: TObject,
    key: TKey
): TObject[TKey];
export function get(o: object, key: string | undefined, defaultValue?: unknown): unknown {
    const value = lodashGet(o, key as string, defaultValue);

    if (value !== undefined) {
        return value;
    }

    if (defaultValue === undefined) {
        throw new RequiredPropertyError({
            key: key as string,
        });
    }

    return defaultValue;
}

export function getAll<TObject extends object, TKey extends keyof TObject>(
    o: TObject,
    requiredKeys: TKey[]
): Partial<TObject> {
    const missingKeys: TKey[] = [];
    const returnDict = {} as Partial<TObject>;

    for (const key of requiredKeys) {
        const val = lodashGet(o, key as string);

        if (val) {
            returnDict[key] = val as TObject[TKey];
        } else {
            missingKeys.push(key);
        }
    }

    if (missingKeys.length > 0) {
        throw new Error(
            `Missing Parameter${
                missingKeys.length == 1 ? '' : 's'
            }: ${missingKeys.join(', ')} ${
                missingKeys.length == 1 ? 'is' : 'are'
            } required.`
        );
    }

    return returnDict;
}

export function getAndVerifyType<
    TObject extends object,
    TKey extends keyof TObject,
    TClassType
>(object: TObject, key: TKey, classType: TClassType): TObject[TKey];
export function getAndVerifyType<
    TObject extends object,
    TKey extends string,
    TClassType,
    TDefault
>(
    object: TObject,
    key: TKey,
    classType: TClassType,
    defaultValue: TDefault
): TKey extends keyof TObject ? TObject[TKey] : TDefault;
export function getAndVerifyType(
    params: object,
    strKey: string,
    classType: new (...args: unknown[]) => unknown,
    defaultValue?: unknown
): unknown {
    const val = get(params, strKey, defaultValue) as Record<string, unknown>;

    if (Array.isArray(val)) {
        for (const index in val) {
            const item = val[index] as Record<string, unknown>;
            if (
                (item.prototype && !(item.prototype instanceof classType)) ||
                (!item.prototype && !(item instanceof classType))
            ) {
                throw new ParameterTypeError({
                    key: `${strKey}[${index}]`,
                    value: String(val),
                    expectedType: classType.constructor as { name?: string },
                });
            }
        }
    } else if (
        (val.prototype && !(val.prototype instanceof classType)) ||
        (!val.prototype && !(val instanceof classType))
    ) {
        throw new ParameterTypeError({
            key: strKey,
            value: String(val),
            expectedType: classType.constructor as { name?: string },
        });
    }
    return val;
}

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
export function getArrayParamAndVerifyParamType(
    params: object,
    strKey: string,
    paramType: TypeOfType,
    defaultValue?: unknown
): unknown {
    const val = get(params, strKey, defaultValue);

    if (Array.isArray(val)) {
        for (const index in val) {
            getParamAndVerifyParamType(val, index, paramType, defaultValue);
        }
    } else {
        throw new ParameterTypeError({
            key: strKey,
            value: String(val),
            expectedType: { name: 'Array' },
        });
    }
    return val;
}

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
export function getParamAndVerifyParamType(
    params: object,
    strKey: string,
    paramType: TypeOfType,
    defaultValue?: unknown
): unknown {
    const val = get(params, strKey, defaultValue);

    if (Array.isArray(val)) {
        throw new Error(`${strKey} should not be an array`);
    }
    verifyType(val, paramType);
    return val;
}

export function verifyType(value: unknown, paramType: TypeOfType): void {
    if (typeof value !== paramType) {
        throw new ParameterTypeError({
            value: String(value),
            expectedType: { name: paramType },
        });
    }
}
