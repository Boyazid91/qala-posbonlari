// Qal'a Posbonlari: Play xaridini tekshirish va tasdiqlash (acknowledge).
// Netlify o'zi ishga tushiradi: POST /.netlify/functions/qp-ack  {token, sku}
// Kerakli muhit o'zgaruvchisi (Netlify → Site configuration → Environment variables):
//   QP_SA_JSON = Google Cloud service account JSON kaliti (butun matn)
// Service account Play Console → Users and permissions orqali ilovaga ulangan bo'lishi kerak.
import crypto from 'node:crypto';

const PKG = 'uz.qalaposbonlari.game';
const SKUS = ['alp', 'tomaris', 'buxoro', 'samarqand', 'hammasi'];
const API = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PKG}/purchases/products`;

const b64u = (b) => Buffer.from(b).toString('base64url');
let cached = null;

async function accessToken() {
  if (cached && cached.exp > Date.now() + 60000) return cached.tok;
  const sa = JSON.parse(process.env.QP_SA_JSON || '{}');
  if (!sa.client_email || !sa.private_key) throw new Error('QP_SA_JSON sozlanmagan');
  const now = Math.floor(Date.now() / 1000);
  const head = b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const body = b64u(JSON.stringify({
    iss: sa.client_email, scope: 'https://www.googleapis.com/auth/androidpublisher',
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
  }));
  const sig = crypto.createSign('RSA-SHA256').update(`${head}.${body}`).sign(sa.private_key, 'base64url');
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${head}.${body}.${sig}` }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error('token olinmadi');
  cached = { tok: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
  return cached.tok;
}

const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json' } });

export default async (req) => {
  if (req.method !== 'POST') return json({ ok: false, err: 'POST kerak' }, 405);
  let token, sku;
  try { ({ token, sku } = await req.json()); } catch { return json({ ok: false, err: 'JSON xato' }, 400); }
  if (!SKUS.includes(sku) || typeof token !== 'string' || token.length < 10 || token.length > 4000) {
    return json({ ok: false, err: "noto'g'ri so'rov" }, 400);
  }
  try {
    const auth = { Authorization: `Bearer ${await accessToken()}` };
    const url = `${API}/${sku}/tokens/${encodeURIComponent(token)}`;
    const g = await fetch(url, { headers: auth });
    if (!g.ok) return json({ ok: false, err: 'xarid topilmadi' }, 400);
    const p = await g.json();
    if (p.purchaseState !== 0) return json({ ok: false, err: 'xarid yakunlanmagan' }, 400); // 0 = to'langan
    if (p.acknowledgementState !== 1) {
      const a = await fetch(`${url}:acknowledge`, { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: '{}' });
      if (!a.ok) return json({ ok: false, err: 'tasdiqlanmadi' }, 502);
    }
    return json({ ok: true, sku });
  } catch (e) {
    return json({ ok: false, err: String(e.message || e) }, 500);
  }
};
