// 기상청 날씨누리 중계함수 (Vercel Serverless Function)
// ------------------------------------------------------------------
// 브라우저 → /api/wnuri?code=4477025000 → 날씨누리 순으로 서버가 대신 호출합니다.
// 날씨누리는 CORS 헤더를 주지 않으므로 브라우저에서 직접 부를 수 없습니다.
//
// 돌려주는 값 (JSON)
//   ta    기온(℃)          rh   습도(%)
//   ws    풍속(m/s)        wd   풍향(한글)
//   feels 날씨누리가 표기한 체감온도(℃)  ← 참고용. 화면에는 우리 공식값을 쓴다.
//   at    기준시각 'HH:MM'  atRaw 원문 '07.31.(금) 15:30 현재'
//   heat  폭염특보 단계 0 없음 / 1 주의보 / 2 경보 / 3 중대경보
//   warnText 특보 원문
//
// ※ 공식 API가 아니라 날씨누리 화면을 읽어오는 방식입니다.
//   기상청이 화면 구조를 바꾸면 파싱이 깨질 수 있으므로,
//   화면 쪽에서 실패를 감지하면 기존 기상청 격자 API로 자동 대체합니다.

const BASE = 'https://www.weather.go.kr/w/wnuri-fct2021/main/current-weather.do';

/* 태그를 모두 걷어내고 공백을 정리해 순수 텍스트로 만든다.
   마크업이 조금 바뀌어도 텍스트만 남으면 파싱이 유지된다. */
function toText(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function num(re, t) {
  const m = t.match(re);
  return m ? parseFloat(m[1]) : null;
}

/* 폭염특보 단계. '폭염영향예보' 라는 링크 글자가 섞여 들어오므로
   '폭염 + 단계' 형태로만 잡는다. 중대경보를 먼저 본다. */
function heatLevel(t) {
  if (/폭염\s*중대\s*경보/.test(t)) return 3;
  if (/폭염\s*경보/.test(t))       return 2;
  if (/폭염\s*주의보/.test(t))     return 1;
  return 0;
}

export default async function handler(req, res) {
  const code = String(req.query.code || '').trim();

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('CDN-Cache-Control', 'no-store');
  res.setHeader('Vercel-CDN-Cache-Control', 'no-store');

  if (!/^\d{10}$/.test(code)) {
    return res.status(400).json({ error: 'code 는 10자리 숫자여야 합니다' });
  }

  try {
    const r = await fetch(`${BASE}?code=${code}&_t=${Date.now()}`, {
      cache: 'no-store',
      headers: {
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'ko-KR,ko;q=0.9',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
                    + '(KHTML, like Gecko) Chrome/124.0 Safari/537.36'
      }
    });
    if (!r.ok) return res.status(200).json({ ok: false, reason: 'http ' + r.status });

    const t = toText(await r.text());

    const ta    = num(/기온\s*:?\s*(-?\d+(?:\.\d+)?)\s*[℃°]/, t);
    const feels = num(/체감\s*\(?\s*(-?\d+(?:\.\d+)?)\s*[℃°]/, t);
    const rh    = num(/습도\s*(\d+)\s*%/, t);

    // 바람: '바람 남서 15.5 km/h' 또는 '바람 남서 4.3 m/s'
    let ws = null, wd = '';
    const w = t.match(/바람\s*([가-힣]*)\s*(\d+(?:\.\d+)?)\s*(km\/h|m\/s)/);
    if (w) {
      wd = w[1] || '';
      ws = w[3] === 'km/h' ? +(parseFloat(w[2]) / 3.6).toFixed(1) : parseFloat(w[2]);
    }

    // 기준시각: '07.31.(금) 15:30 현재'
    const a = t.match(/(\d{1,2})\.(\d{1,2})\.\s*\([가-힣]\)\s*(\d{1,2}:\d{2})\s*현재/);

    // 특보: '해당지역에 … 발효중' / '해당지역에 발효중인 특보가 없습니다'
    let warnText = '';
    const none = /발효중인\s*특보가\s*없습니다/.test(t);
    if (!none) {
      const m = t.match(/해당지역에\s*(.{0,120}?)\s*발효\s*중/);
      if (m) warnText = m[1].replace(/폭염영향예보\s*,?\s*/g, '').replace(/^[\s,]+/, '');
    }

    if (ta === null || rh === null) {
      return res.status(200).json({ ok: false, reason: 'parse', sample: t.slice(0, 200) });
    }

    return res.status(200).json({
      ok: true, code, ta, rh, ws, wd, feels,
      at: a ? a[3].padStart(5, '0') : null,
      atRaw: a ? `${a[1]}.${a[2]}. ${a[3]}` : null,
      heat: none ? 0 : heatLevel(warnText),
      warnText: none ? '' : warnText
    });
  } catch (e) {
    return res.status(200).json({ ok: false, reason: String(e.message || e) });
  }
}
