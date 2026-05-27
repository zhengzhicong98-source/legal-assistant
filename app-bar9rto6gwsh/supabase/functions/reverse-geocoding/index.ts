import { corsHeaders } from '../_shared/cors.ts'

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
    const { location, coordtype, extensions_poi, extensions_road } = body

    if (!location) {
      return new Response(
        JSON.stringify({ error: 'location 为必填参数，格式：纬度,经度' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const params = new URLSearchParams({
      location,
      coordtype: coordtype ?? 'bd09ll',
      extensions_poi: extensions_poi ?? '0',
      output: 'json',
      language: 'zh-CN',
    })
    if (extensions_road) params.set('extensions_road', extensions_road)

    const upstream = await fetch(
      `https://app-bar9rto6gwsh-api-baBwZEjbe1X9-gateway.appmiaoda.com/reverse_geocoding/v3?${params}`,
      {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'X-Gateway-Authorization': `Bearer ${apiKey}`,
        },
      }
    )

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
    console.error('reverse-geocoding 错误:', err)
    return new Response(
      JSON.stringify({ error: '逆地理编码服务异常，请稍后重试' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
