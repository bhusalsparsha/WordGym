export interface JwtClaims {
  sub: string;
  username: string;
  role?: 'player' | 'admin' | 'spectator';
  exp?: number;
  iat?: number;
  iss?: string;
  aud?: string;
}

function base64UrlEncode(value: ArrayBuffer | string): string {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : new Uint8Array(value);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function base64UrlDecode(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function sign(data: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return base64UrlEncode(signature);
}

export async function createJwt(claims: JwtClaims, secret: string): Promise<string> {
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64UrlEncode(JSON.stringify(claims));
  const token = `${header}.${payload}`;
  const signature = await sign(token, secret);
  return `${token}.${signature}`;
}

export async function verifyJwt(token: string, secret: string): Promise<JwtClaims | null> {
  const [header, payload, signature] = token.split('.');
  if (!header || !payload || !signature) {
    return null;
  }

  const expected = await sign(`${header}.${payload}`, secret);
  if (expected !== signature) {
    return null;
  }

  try {
    return JSON.parse(new TextDecoder().decode(base64UrlDecode(payload))) as JwtClaims;
  } catch {
    return null;
  }
}

export function createOAuthAuthorizeUrl(provider: 'google' | 'github', clientId: string, redirectUri: string, state: string): string {
  const authorizationEndpoint = provider === 'google'
    ? 'https://accounts.google.com/o/oauth2/v2/auth'
    : 'https://github.com/login/oauth/authorize';

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: provider === 'google' ? 'openid profile email' : 'read:user user:email',
    state,
  });

  return `${authorizationEndpoint}?${params.toString()}`;
}
