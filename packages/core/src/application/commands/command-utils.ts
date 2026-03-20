export interface ErrorResponse {
    error: number;
    reason?: string;
    code?: string;
}

export function mapErrorToResponse(
    errorCodeMap: Record<string, number>,
    error: Error & { code?: string | number },
): ErrorResponse {
    const status = errorCodeMap[String(error?.code ?? '')] || 500;
    return {
        error: status,
        reason: error?.message,
        code: error?.code as string | undefined,
    };
}
