import { corsHeaders } from '../_shared/cors.ts'

// 三个百度地图 API 网关地址
const REGION_API = 'https://app-bar9rto6gwsh-api-ra5EZvmRrG4a-gateway.appmiaoda.com/place/v3/region'
const NEARBY_API = 'https://app-bar9rto6gwsh-api-DLEO7eMnzMwa-gateway.appmiaoda.com/place/v3/around'
const DETAIL_API = 'https://app-bar9rto6gwsh-api-GaDwZekp8WzY-gateway.appmiaoda.com/place/v3/detail'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const apiKey = Deno.env.get('INTEGRATIONS_API_KEY')
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: '服务配置错误' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const headers = {
      'X-Gateway-Authorization': `Bearer ${apiKey}`,
      'Accept': 'application/json',
    }

    const url = new URL(req.url)
    const mode = url.searchParams.get('mode') // region | nearby | detail

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
      const params = new URLSearchParams({ query, region, region_limit: 'true', scope: '2', page_size: '20' })
      const resp = await fetch(`${REGION_API}?${params}`, { headers, signal: AbortSignal.timeout(10000) })
      if (!resp.ok) {
        const errText = await resp.text()
        if (resp.status === 429) return new Response(JSON.stringify({ error: '请求过于频繁，请稍后再试' }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        if (resp.status === 402) return new Response(JSON.stringify({ error: 'API余额不足' }), { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        console.error('region API 错误:', errText)
        return new Response(JSON.stringify({ error: '地图服务暂时不可用' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      const data = await resp.json()
      return new Response(JSON.stringify(data), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
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
        query,
        location: `${lat},${lng}`,
        radius,
        radius_limit: 'false',
        scope: '2',
        page_size: '20',
      })
      const resp = await fetch(`${NEARBY_API}?${params}`, { headers, signal: AbortSignal.timeout(10000) })
      if (!resp.ok) {
        const errText = await resp.text()
        if (resp.status === 429) return new Response(JSON.stringify({ error: '请求过于频繁，请稍后再试' }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        if (resp.status === 402) return new Response(JSON.stringify({ error: 'API余额不足' }), { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        console.error('nearby API 错误:', errText)
        return new Response(JSON.stringify({ error: '地图服务暂时不可用' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      const data = await resp.json()
      return new Response(JSON.stringify(data), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
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
      const params = new URLSearchParams({ uid, scope: '2' })
      const resp = await fetch(`${DETAIL_API}?${params}`, { headers, signal: AbortSignal.timeout(10000) })
      if (!resp.ok) {
        const errText = await resp.text()
        if (resp.status === 429) return new Response(JSON.stringify({ error: '请求过于频繁，请稍后再试' }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        if (resp.status === 402) return new Response(JSON.stringify({ error: 'API余额不足' }), { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        console.error('detail API 错误:', errText)
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
