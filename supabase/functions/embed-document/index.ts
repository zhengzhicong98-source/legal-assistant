import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const EMBED_API = 'https://open.bigmodel.cn/api/paas/v4/embeddings'

/** 调用 Embedding API 获取文本向量 */
async function getEmbedding(text: string, apiKey: string): Promise<number[]> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15000) // 15s 超时
  try {
    const response = await fetch(EMBED_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'embedding-3',
        input: text,
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      const errText = await response.text()
      throw new Error(`Embedding API 错误: ${response.status} ${errText}`)
    }

    const data = await response.json()
    const embedding = data?.data?.[0]?.embedding
    if (!Array.isArray(embedding)) {
      throw new Error('Embedding API 返回格式异常')
    }
    return embedding
  } finally {
    clearTimeout(timer)
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // JWT 认证校验：防止未登录用户操作知识库
    const authHeader = req.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: '请先登录', code: 'UNAUTHORIZED' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    const token = authHeader.replace('Bearer ', '')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!)
    const { data: { user }, error: authError } = await userClient.auth.getUser(token)
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: '认证失败，请重新登录', code: 'AUTH_FAILED' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const apiKey = Deno.env.get('INTEGRATIONS_API_KEY')

    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: '服务配置错误' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(supabaseUrl, serviceKey)

    // 统一解析请求体（GET/OPTIONS 不需要 body，DELETE/POST/PATCH 都需要）
    let body: Record<string, unknown> | null = null
    if (req.method !== 'GET' && req.method !== 'OPTIONS') {
      try {
        body = await req.json()
      } catch {
        body = null
      }
    }

    // DELETE：删除知识库条目
    if (req.method === 'DELETE') {
      const id = body?.id
      if (!id) {
        return new Response(
          JSON.stringify({ error: '缺少文档 ID' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      const { error } = await supabase.from('legal_knowledge').delete().eq('id', id)
      if (error) throw error
      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // GET：获取知识库列表（含 has_embedding 状态，不含向量字段本身）
    if (req.method === 'GET') {
      const url = new URL(req.url)
      // GET ?pending=true 只返回未向量化的记录
      const pendingOnly = url.searchParams.get('pending') === 'true'

      let query = supabase
        .from('legal_knowledge')
        .select('id, title, source, category, content, created_at')
        .order('created_at', { ascending: false })
        .limit(300)

      if (pendingOnly) {
        query = query.is('embedding', null)
      }

      const { data, error } = await query
      if (error) throw error

      // 单独查询 has_embedding 状态
      const { data: embeddingStatus } = await supabase
        .from('legal_knowledge')
        .select('id')
        .not('embedding', 'is', null)

      const embeddedIds = new Set((embeddingStatus ?? []).map((r: { id: string }) => r.id))
      const docs = (data ?? []).map((d: { id: string }) => ({
        ...d,
        has_embedding: embeddedIds.has(d.id),
      }))

      return new Response(
        JSON.stringify({ docs }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // PATCH：对已有记录按 ID 更新 embedding（一键向量化场景）
    // 注意：微信小程序 wx.request 不支持 PATCH 方法，故前端用 POST + vectorize_only=true 路由到此逻辑
    if (req.method === 'PATCH' || body?.vectorize_only === true) {
      const id = body?.id as string | undefined
      const title = body?.title as string | undefined
      const content = body?.content as string | undefined
      if (!id || !content) {
        return new Response(
          JSON.stringify({ error: '缺少必要字段 id 或 content' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const textToEmbed = title ? `${title}\n${content}` : content
      const embedding = await getEmbedding(textToEmbed, apiKey)

      const { error } = await supabase
        .from('legal_knowledge')
        .update({ embedding: `[${embedding.join(',')}]` })
        .eq('id', id)

      if (error) throw error

      return new Response(
        JSON.stringify({ success: true, id }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // POST：上传新文档并向量化
    const title = body?.title as string | undefined
    const source = body?.source as string | undefined
    const category = body?.category as string | undefined
    const content = body?.content as string | undefined

    if (!title || !content) {
      return new Response(
        JSON.stringify({ error: '标题和内容不能为空' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 将内容按 500 字分块（简单分块策略）
    const chunkSize = 500
    const overlap = 50
    const chunks: string[] = []

    if (content.length <= chunkSize) {
      chunks.push(content)
    } else {
      let start = 0
      while (start < content.length) {
        const end = Math.min(start + chunkSize, content.length)
        chunks.push(content.slice(start, end))
        start += chunkSize - overlap
      }
    }

    const inserted: string[] = []

    for (let i = 0; i < chunks.length; i++) {
      const chunkText = chunks[i]
      const textToEmbed = `${title}\n${chunkText}`

      let embedding: number[]
      try {
        embedding = await getEmbedding(textToEmbed, apiKey)
      } catch (embedErr) {
        console.error('向量化失败，跳过此块:', embedErr)
        const { data, error } = await supabase
          .from('legal_knowledge')
          .insert({
            title: chunks.length > 1 ? `${title}（第${i + 1}段）` : title,
            source: source || '',
            category: category || '通用',
            content: chunkText,
            embedding: null,
          })
          .select('id')
          .maybeSingle()
        if (!error && data) inserted.push((data as { id: string }).id)
        continue
      }

      const { data, error } = await supabase
        .from('legal_knowledge')
        .insert({
          title: chunks.length > 1 ? `${title}（第${i + 1}段）` : title,
          source: source || '',
          category: category || '通用',
          content: chunkText,
          embedding: `[${embedding.join(',')}]`,
        })
        .select('id')
        .maybeSingle()

      if (error) {
        console.error('插入知识库失败:', error)
      } else if (data) {
        inserted.push((data as { id: string }).id)
      }
    }

    return new Response(
      JSON.stringify({ success: true, inserted_count: inserted.length, ids: inserted }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('embed-document 错误:', error)
    return new Response(
      JSON.stringify({ error: '服务异常，请稍后重试' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
