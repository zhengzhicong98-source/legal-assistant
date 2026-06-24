import { corsHeaders } from '../_shared/cors.ts'

const TYPE_MAP: Record<string, string> = {
  driving: '0',
  riding:  '3',
  walking: '1',
}

/** 米/秒 → 前端展示用 {text,value} */
function fmtDistance(meters: number) {
  const text = meters >= 1000 ? `${(meters / 1000).toFixed(1)}公里` : `${Math.round(meters)}米`
  return { text, value: meters }
}
function fmtDuration(seconds: number) {
  const mins = Math.round(seconds / 60)
  const text = mins < 1 ? '不到1分钟' : mins < 60 ? `约${mins}分钟` : `约${Math.floor(mins / 60)}小时${mins % 60 > 0 ? `${mins % 60}分` : ''}`
  return { text, value: seconds }
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

    const body = await req.json()
    const { mode, origins, destinations } = body

    if (!TYPE_MAP[mode]) {
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

    // 高德 v5 距离矩阵支持「单 destination + 多 origins」。
    // 前端语义是「单 origin（用户）+ 多 destinations（机构）」，故反向映射：
    // 把每个机构坐标作为高德 origins，用户坐标作为高德 destination，
    // 返回结果顺序与高德 origins（即前端 destinations）一一对应。
    const amapOrigins = destinations
    const amapDestination = origins[0]

    const params = new URLSearchParams({
      origins: amapOrigins.join('|'),
      destination: amapDestination,
      type: TYPE_MAP[mode],
      key: amapKey,
    })

    const upstream = await fetch(
      `https://restapi.amap.com/v5/direction/distance?${params}`,
      { method: 'GET', headers: { 'Accept': 'application/json' } }
    )

    if (!upstream.ok) {
      return new Response(
        JSON.stringify({ error: `上游服务错误: ${upstream.status}` }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const data = await upstream.json()
    if (data.status !== '1' || !Array.isArray(data.results)) {
      return new Response(
        JSON.stringify({ status: 1, result: [], error: data.info || '上游算路失败' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 高德 results 按 origin_id 排序，归一化为前端约定结构
    const result = (data.results as { origin_id?: string; distance?: string; duration?: string }[])
      .map((r) => ({
        distance: fmtDistance(Number(r.distance ?? 0)),
        duration: fmtDuration(Number(r.duration ?? 0)),
      }))

    return new Response(JSON.stringify({ status: 0, result }), {
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
