// Helper gọi Azure VM backend từ Next.js server-side routes

const url = (path: string) => {
  const base = process.env.AZURE_BACKEND_URL;
  if (!base) throw new Error('AZURE_BACKEND_URL chưa cấu hình');
  return base.replace(/\/+$/, '') + path;
};

const headers = () => {
  const key = process.env.AZURE_API_SECRET_KEY;
  if (!key) throw new Error('AZURE_API_SECRET_KEY chưa cấu hình');
  return { 'x-api-key': key, 'Content-Type': 'application/json' };
};

export async function azureGet<T = unknown>(path: string, params?: Record<string, string>): Promise<T> {
  const u = new URL(url(path));
  if (params) Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
  const res = await fetch(u, { headers: headers(), cache: 'no-store' });
  if (!res.ok) throw new Error(`Azure ${path} ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

export async function azurePost<T = unknown>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(url(path), {
    method: 'POST',
    headers: headers(),
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Azure ${path} ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}
