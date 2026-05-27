import { corsHeaders } from '../_shared/cors.ts'

// 每种出行方式对应独立的网关域名
const MATRIX_ENDPOINTS: Record<string, string> = {
  driving: 'https://app-bar9rto6gwsh-api-6LeBrqqMqKQY-gateway.appmiaoda.com/routematrix/v2/driving',
  riding:  'https://app-bar9rto6gwsh-api-Aa2Pq88pDANL-gateway.appmiaoda.com/routematrix/v2/riding',
  walking: 'https://app-bar9rto6gwsh-api-qYGW2zz1MklY-gateway.appmiaoda.com/routematrix/v2/walking',
}

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

    const body = await req.json()
    const { mode, origins, destinations, extra = {} } = body

    if (!MATRIX_ENDPOINTS[mode]) {
      return new Response(
        JSON.stringify({ error: `无效的出行模式：${mode}，支持 driving/riding/walking` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    if (!Array.isArray(origins) || origins.length === 0) {
      return new Response(
        JSON.stringify({ error: 'origins 必须为非空数组' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    if (!Array.isArray(destinations) || destinations.length === 0) {
      return new Response(
        JSON.stringify({ error: 'destinations 必须为非空数组' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const params = new URLSearchParams({
      origins: origins.join('|'),
      destinations: destinations.join('|'),
      output: 'json',
      ...Object.fromEntries(Object.entries(extra).map(([k, v]) => [k, String(v)])),
    })

    const upstream = await fetch(`${MATRIX_ENDPOINTS[mode]}?${params}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'X-Gateway-Authorization': `Bearer ${apiKey}`,
      },
    })

    if (upstream.status === 429 || upstream.status === 402) {
      const text = await upstream.text()
      return new Response(text, { status: upstream.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    if (!upstream.ok) {
      return new Response(
        JSON.stringify({ error: `上游服务错误: ${upstream.status}` }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const data = await upstream.json()
    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('route-matrix 错误:', err)
    return new Response(
      JSON.stringify({ error: '批量算路服务异常，请稍后重试' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
