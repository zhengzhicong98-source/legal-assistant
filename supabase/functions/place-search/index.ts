import { corsHeaders } from '../_shared/cors.ts'

/** 高德 poi（location 为 "lng,lat" 字符串）归一化为前端约定的结构（location 为 {lat,lng}） */
interface AmapPoi {
  name?: string
  address?: string
  id?: string
  pname?: string
  cityname?: string
  adname?: string
  location?: string
  distance?: string
}
function normalizePois(pois: AmapPoi[]): unknown[] {
  if (!Array.isArray(pois)) return []
  return pois.map((p) => {
    const [lng, lat] = (p.location || '').split(',').map(Number)
    return {
      name: p.name || '',
      address: typeof p.address === 'string' ? p.address : '',
      uid: p.id || '',
      province: p.pname,
      city: p.cityname,
      area: p.adname,
      location: { lat: lat || 0, lng: lng || 0 },
      detail_info: p.distance != null ? { distance: Number(p.distance) } : undefined,
    }
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const amapKey = Deno.env.get('AMAP_KEY')
    if (!amapKey) {
      return new Response(
        JSON.stringify({ error: '服务配置错误' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const url = new URL(req.url)
    const mode = url.searchParams.get('mode')

    // ===== 行政区域检索 =====
    if (mode === 'region') {
      const query = url.searchParams.get('query') || '劳动仲裁委$消费者协会$法律援助中心'
      const region = url.searchParams.get('region')
      if (!region) {
        return new Response(
          JSON.stringify({ error: '缺少 region 参数' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      const params = new URLSearchParams({ keywords: query, region, key: amapKey, output: 'json', offset: '20' })
      const resp = await fetch(`https://restapi.amap.com/v3/place/text?${params}`, {
        signal: AbortSignal.timeout(10000),
      })
      if (!resp.ok) {
        console.error('region API 错误:', await resp.text())
        if (resp.status === 429) return new Response(JSON.stringify({ error: '请求过于频繁，请稍后再试' }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        return new Response(JSON.stringify({ error: '地图服务暂时不可用' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      const data = await resp.json()
      return new Response(
        JSON.stringify({ results: normalizePois(data.pois || []), status: data.status === '1' ? 0 : 1 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ===== 周边检索 =====
    if (mode === 'nearby') {
      const query = url.searchParams.get('query') || '劳动仲裁委$消费者协会$法律援助中心'
      const lat = url.searchParams.get('lat')
      const lng = url.searchParams.get('lng')
      const radius = url.searchParams.get('radius') || '5000'
      if (!lat || !lng) {
        return new Response(
          JSON.stringify({ error: '缺少 lat/lng 参数' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      const params = new URLSearchParams({
        keywords: query,
        location: `${lng},${lat}`,
        radius,
        key: amapKey,
        output: 'json',
        offset: '20',
      })
      const resp = await fetch(`https://restapi.amap.com/v3/place/around?${params}`, {
        signal: AbortSignal.timeout(10000),
      })
      if (!resp.ok) {
        console.error('nearby API 错误:', await resp.text())
        if (resp.status === 429) return new Response(JSON.stringify({ error: '请求过于频繁，请稍后再试' }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        return new Response(JSON.stringify({ error: '地图服务暂时不可用' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      const data = await resp.json()
      return new Response(
        JSON.stringify({ results: normalizePois(data.pois || []), status: data.status === '1' ? 0 : 1 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ===== 地点详情 =====
    if (mode === 'detail') {
      const uid = url.searchParams.get('uid')
      if (!uid) {
        return new Response(
          JSON.stringify({ error: '缺少 uid 参数' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      const params = new URLSearchParams({ id: uid, key: amapKey, output: 'json' })
      const resp = await fetch(`https://restapi.amap.com/v3/place/detail?${params}`, {
        signal: AbortSignal.timeout(10000),
      })
      if (!resp.ok) {
        console.error('detail API 错误:', await resp.text())
        if (resp.status === 429) return new Response(JSON.stringify({ error: '请求过于频繁，请稍后再试' }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        return new Response(JSON.stringify({ error: '地图服务暂时不可用' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      const data = await resp.json()
      return new Response(JSON.stringify(data), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    return new Response(
      JSON.stringify({ error: '无效的 mode 参数，可选值: region | nearby | detail' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    console.error('place-search 错误:', err)
    return new Response(
      JSON.stringify({ error: '服务异常，请稍后重试' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
