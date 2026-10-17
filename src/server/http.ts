export const json = (value: unknown, status = 200): Response =>
  Response.json(value, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
export class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
export async function readJson(request: Request, limit = 8192): Promise<Record<string, unknown>> {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new HttpError(400, 'JSON required');
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, 'Body required');
  let text = '',
    size = 0;
  const decoder = new TextDecoder();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new HttpError(413, 'Body too large');
    }
    text += decoder.decode(value, { stream: true });
  }
  let result: unknown;
  try {
    result = JSON.parse(text + decoder.decode());
  } catch {
    throw new HttpError(400, 'Invalid JSON');
  }
  if (!result || typeof result !== 'object' || Array.isArray(result)) throw new HttpError(400, 'Object required');
  return result as Record<string, unknown>;
}
export async function authorized(request: Request, secret: string | undefined): Promise<boolean> {
  if (!secret || secret.length < 32) return false;
  const supplied = request.headers.get('Authorization')?.replace(/^Bearer /, '') ?? '';
  if (supplied.length > 1024) return false;
  const hash = (s: string) => crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  const [a, b] = (await Promise.all([hash(secret), hash(supplied)])).map((b) => new Uint8Array(b));
  let diff = 0;
  for (let i = 0; i < a!.length; i++) diff |= a![i]! ^ b![i]!;
  return diff === 0;
}
export function failure(error: unknown): Response {
  return json({ error: error instanceof HttpError ? error.message : 'Invalid request' }, error instanceof HttpError ? error.status : 400);
}
