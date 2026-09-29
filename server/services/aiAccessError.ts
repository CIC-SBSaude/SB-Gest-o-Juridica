export const AI_ACCESS_DENIED = 'AI_ACCESS_DENIED';

export function providerHttpStatus(error: any): number {
  const candidates = [error?.status, error?.statusCode, error?.response?.status,
    error?.code, error?.error?.code, error?.response?.data?.error?.code];
  for (const value of candidates) {
    const status = Number(value);
    if (status >= 400 && status <= 599) return status;
  }
  return 0;
}

export function isAiAccessDenied(error: any): boolean {
  return error?.code === AI_ACCESS_DENIED || [401, 403].includes(providerHttpStatus(error)) ||
    ['PermissionDeniedError', 'AuthenticationError'].includes(error?.name) ||
    [error?.status, error?.error?.status, error?.response?.data?.error?.status]
      .some(status => ['PERMISSION_DENIED', 'UNAUTHENTICATED'].includes(status));
}

export function aiAccessError(message: string, status = 403) {
  return Object.assign(new Error(message), { code: AI_ACCESS_DENIED, status, retryable: false });
}
