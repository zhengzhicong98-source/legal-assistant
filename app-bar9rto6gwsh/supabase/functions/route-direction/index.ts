import { corsHeaders } from '../_shared/cors.ts'

// 每种出行方式对应独立的网关域名（不可复用同一域名）
const ENDPOINTS: Record<string, string> = {
  driving: 'https://app-bar9rto6gwsh-api-GaDwZKpJxXOY-gateway.appmiaoda.com/direction/v2/driving',
  riding:  'https://app-bar9rto6gwsh-api-W9z3MpAdKeNL-gateway.appmiaoda.com/direction/v2/riding',
  walking: 'https://app-bar9rto6gwsh-api-wLNdomNRn42a-gateway.appmiaoda.com/direction/v2/walking',
  transit: 'https://app-bar9rto6gwsh-api-m9xKXQkOKZXa-gateway.appmiaoda.com/direction/v2/transit',
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
    const { mode, origin, destination, extra = {} } = body

    if (!ENDPOINTS[mode]) {
      return new Response(
        JSON.stringify({ error: `无效的出行模式：${mode}，支持 driving/riding/walking/transit` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    if (!origin || !destination) {
      return new Response(
        JSON.stringify({ error: 'origin 和 destination 为必填参数' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const params = new URLSearchParams({
      origin,
      destination,
      output: 'json',
      ...Object.fromEntries(Object.entries(extra).map(([k, v]) => [k, String(v)])),
    })

    const upstream = await fetch(`${ENDPOINTS[mode]}?${params}`, {
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
    console.error('route-direction 错误:', err)
    return new Response(
      JSON.stringify({ error: '路线规划服务异常，请稍后重试' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
