import { corsHeaders } from '../_shared/cors.ts'

// 百度 IP 定位网关端点
const IP_API = 'https://app-bar9rto6gwsh-api-79jK62Ze2pQL-gateway.appmiaoda.com/location/ip'

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

    // 不传 ip 参数，默认使用请求来源 IP 定位
    const response = await fetch(IP_API, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'X-Gateway-Authorization': `Bearer ${apiKey}`,
      },
    })

    if (!response.ok) {
      throw new Error(`IP API 响应错误: ${response.status}`)
    }

    const data = await response.json()

    // status !== 0 表示百度 API 返回错误
    if (data.status !== 0) {
      return new Response(
        JSON.stringify({ error: 'IP定位失败', code: data.status }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const detail = data?.content?.address_detail || {}
    return new Response(
      JSON.stringify({
        province: detail.province || '',
        city: detail.city || '',
        district: detail.district || '',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('ip-location 错误:', error)
    return new Response(
      JSON.stringify({ error: 'IP定位服务异常，请稍后重试' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
