import { corsHeaders } from '../_shared/cors.ts'

const AI_SEARCH_API = 'https://app-bar9rto6gwsh-api-DYJwo27V8Qya-gateway.appmiaoda.com/v2/ai_search/chat/completions'

interface Reference {
  id: number
  title: string
  url: string
  web_anchor?: string
  date?: string
  type?: string
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

    const { query } = await req.json()
    if (!query || !String(query).trim()) {
      return new Response(
        JSON.stringify({ error: '搜索内容不能为空' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 在查询前加法律背景，提升搜索质量
    const legalQuery = `法律咨询：${String(query).trim()}`

    const resp = await fetch(AI_SEARCH_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Gateway-Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        messages: [{ role: 'user', content: legalQuery }],
        enable_deep_search: false,
        enable_reasoning: false,
        resource_type_filter: [{ type: 'web', top_k: 6 }],
        enable_followup_queries: false,
        max_completion_tokens: 1500,
      }),
      signal: AbortSignal.timeout(55000),
    })

    if (!resp.ok) {
      const errText = await resp.text()
      if (resp.status === 429) return new Response(JSON.stringify({ error: '请求过于频繁，请稍后再试' }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      if (resp.status === 402) return new Response(JSON.stringify({ error: 'API余额不足，请联系管理员' }), { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      console.error('百度AI搜索 API 错误:', errText)
      return new Response(JSON.stringify({ error: 'AI搜索服务暂时不可用，请稍后再试' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // 收集 SSE 流式响应
    const reader = resp.body?.getReader()
    const decoder = new TextDecoder()
    let fullContent = ''
    const references: Reference[] = []

    if (reader) {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split('\n').filter(l => l.trim())
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const raw = line.slice(6)
          if (raw === '[DONE]') continue
          try {
            const parsed = JSON.parse(raw)
            // 收集内容
            const delta = parsed?.choices?.[0]?.delta?.content
            if (delta) fullContent += delta
            // 收集参考来源（每个 SSE chunk 顶层都可能含 references）
            if (Array.isArray(parsed?.references)) {
              for (const ref of parsed.references as Reference[]) {
                if (ref.id && !references.find(r => r.id === ref.id)) {
                  references.push(ref)
                }
              }
            }
          } catch {
            // 忽略解析错误
          }
        }
      }
    }

    return new Response(
      JSON.stringify({ content: fullContent, references }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    console.error('ai-search 错误:', err)
    return new Response(
      JSON.stringify({ error: '搜索服务异常，请稍后重试' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
