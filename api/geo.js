// 주소 → 위경도 → 기상청 동네예보 격자(nx, ny)
// 관리 페이지의 [주소로 좌표 찾기] 에서 호출합니다.
// 지오코딩은 Nominatim(OpenStreetMap)을 씁니다. 별도 키가 필요 없습니다.

function toGrid(lat, lon) {
  const RE = 6371.00877, GRID = 5.0;
  const SLAT1 = 30.0, SLAT2 = 60.0, OLON = 126.0, OLAT = 38.0, XO = 43, YO = 136;
  const D = Math.PI / 180.0;
  const re = RE / GRID, slat1 = SLAT1 * D, slat2 = SLAT2 * D, olon = OLON * D, olat = OLAT * D;
  let sn = Math.tan(Math.PI * 0.25 + slat2 * 0.5) / Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(sn);
  let sf = Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sf = Math.pow(sf, sn) * Math.cos(slat1) / sn;
  let ro = Math.tan(Math.PI * 0.25 + olat * 0.5);
  ro = re * sf / Math.pow(ro, sn);
  let ra = Math.tan(Math.PI * 0.25 + lat * D * 0.5);
  ra = re * sf / Math.pow(ra, sn);
  let th = lon * D - olon;
  if (th > Math.PI) th -= 2 * Math.PI;
  if (th < -Math.PI) th += 2 * Math.PI;
  th *= sn;
  return { nx: Math.floor(ra * Math.sin(th) + XO + 0.5), ny: Math.floor(ro - ra * Math.cos(th) + YO + 0.5) };
}

export default async function handler(req, res) {
  const q = req.query.q;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (!q) return res.status(400).json({ error: 'q 파라미터가 필요합니다' });
  try {
    const url = 'https://nominatim.openstreetmap.org/search'
              + '?format=json&limit=3&countrycodes=kr&q=' + encodeURIComponent(q);
    const r = await fetch(url, {
      headers: { 'User-Agent': 'hansol-heat-dashboard/1.0', 'Accept-Language': 'ko' }
    });
    const hits = r.ok ? await r.json() : [];
    return res.status(200).json({
      q,
      results: hits.map(h => {
        const lat = parseFloat(h.lat), lon = parseFloat(h.lon);
        return { lat, lon, ...toGrid(lat, lon), name: h.display_name };
      })
    });
  } catch (e) {
    return res.status(502).json({ error: String(e.message || e) });
  }
}
