// 기상청 API 중계함수 (Vercel Serverless Function)
// ------------------------------------------------------------------
// 브라우저 → /api/kma → 공공데이터포털 순으로 서버가 대신 호출합니다.
// 서버끼리의 통신이라 CORS가 적용되지 않고, 인증키도 브라우저에 노출되지 않습니다.
//
// 인증키는 Vercel 환경변수 KMA_KEY 로 넣는 것을 권장합니다.
// (Vercel 프로젝트 → Settings → Environment Variables)

const FALLBACK_KEY = '7715b3bacfda3f6759e8b5b6fa525223a3c7fc08c673a8d28252cd6116ff4e1b';

export default async function handler(req, res) {
  const { path, ...rest } = req.query;
  if (!path) return res.status(400).json({ error: 'path 파라미터가 필요합니다' });

  const key = process.env.KMA_KEY || FALLBACK_KEY;
  const qs  = new URLSearchParams({ serviceKey: key, dataType: 'JSON', ...rest });
  const url = 'https://apis.data.go.kr/1360000/' + path + '?' + qs;

  try {
    const r = await fetch(url, { headers: { Accept: 'application/json' } });
    const text = await r.text();
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    return res.status(200).send(text);
  } catch (e) {
    return res.status(502).json({ proxyError: String(e.message || e) });
  }
}
