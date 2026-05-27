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
    const { address, city, ret_coordtype } = body

    if (!address) {
      return new Response(
        JSON.stringify({ error: 'address 为必填参数' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const params = new URLSearchParams({
      address,
      output: 'json',
      ret_coordtype: ret_coordtype ?? 'bd09ll',
    })
    if (city) params.set('city', city)

    const upstream = await fetch(
      `https://app-bar9rto6gwsh-api-GaDwZ0j3erOY-gateway.appmiaoda.com/geocoding/v3/?${params}`,
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
    console.error('geocoding 错误:', err)
    return new Response(
      JSON.stringify({ error: '地理编码服务异常，请稍后重试' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
