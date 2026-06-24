import { corsHeaders } from '../_shared/cors.ts'
import { ok, err, handleOptions, logRequest } from '../_shared/response.ts'

const AI_SEARCH_API = 'https://open.bigmodel.cn/api/paas/v4/chat/completions'

interface Reference {
  id: number
  title: string
  url: string
  web_anchor?: string
  date?: string
  type?: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleOptions()

  try {
    logRequest(req, 'ai-search')

    const apiKey = Deno.env.get('INTEGRATIONS_API_KEY')
    if (!apiKey) return err('服务配置错误', 500)

    const { query } = await req.json()
    if (!query || !String(query).trim()) {
      return err('搜索内容不能为空', 400)
    }

    // 在查询前加法律背景，提升搜索质量
    const legalQuery = `法律咨询：${String(query).trim()}`

    const resp = await fetch(AI_SEARCH_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
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
      console.error('[ai-search] API错误:', errText)
      if (resp.status === 429) return err('请求过于频繁，请稍后再试', 429)
      if (resp.status === 402) return err('API余额不足，请联系管理员', 402)
      return err('AI搜索服务暂时不可用，请稍后再试', 500)
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

    return ok({ content: fullContent, references })

  } catch (err) {
    console.error('[ai-search] 错误:', err)
    return err('搜索服务异常，请稍后重试', 500)
  }
})
