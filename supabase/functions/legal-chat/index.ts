import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const TEXT_API = 'https://app-bar9rto6gwsh-api-zYkZz8qovQ1L-gateway.appmiaoda.com/v2/chat/completions'
const EMBED_API = 'https://app-bar9rto6gwsh-api-zYkZz8qovQ1L-gateway.appmiaoda.com/v2/embeddings'

/** 调用 Embedding API 获取查询向量（失败时静默返回 null，不阻断正常对话） */
async function getQueryEmbedding(text: string, apiKey: string): Promise<number[] | null> {
  try {
    // 使用 AbortController 代替 AbortSignal.timeout()，兼容性更好
    const embedController = new AbortController()
    const embedTimer = setTimeout(() => embedController.abort(), 3000) // 3 秒超时，快速失败不拖累主流程
    let response: Response
    try {
      response = await fetch(EMBED_API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Gateway-Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ model: 'text-embedding-3-small', input: text, dimensions: 1024 }),
        signal: embedController.signal,
      })
    } finally {
      clearTimeout(embedTimer)
    }
    if (!response.ok) return null
    const data = await response.json()
    const embedding = data?.data?.[0]?.embedding
    return Array.isArray(embedding) ? embedding : null
  } catch {
    return null
  }
}

/** 从知识库检索与问题最相关的法律条文 */
async function searchLegalDocs(
  query: string,
  apiKey: string,
  supabaseUrl: string,
  serviceKey: string
): Promise<{ title: string; source: string; content: string }[]> {
  const embedding = await getQueryEmbedding(query, apiKey)
  if (!embedding) return []

  try {
    const supabase = createClient(supabaseUrl, serviceKey)
    const { data, error } = await supabase.rpc('match_legal_docs', {
      query_embedding: `[${embedding.join(',')}]`,
      match_count: 3,
      min_similarity: 0.5,
    })
    if (error || !data) return []
    return (data as { title: string; source: string; content: string }[])
  } catch {
    return []
  }
}

const LEGAL_SYSTEM_PROMPT = `你是一位深耕中国劳动法与民法典的资深律师助手，专门为大学生提供法律咨询服务，人称"法律学长"。

在回答时，请严格按以下格式输出（必须包含这五个部分，使用---分隔符）：

[结论与分析]
直接给出结论和分析，先说结论，再解释原因。

---法律依据---
引用具体的法律条文，格式：《法律名称》第X条：条文内容。

---学长翻译官---
用一两句大白话翻译以上法律依据的实际含义，让大学生一听就懂。例如：「意思就是这押金法律上本来就该退给你」或「说白了就是试用期最多3个月，超出部分算违法」。语气亲切像学长解释。

---话术模板---
提供用户可以直接使用的沟通话术或维权语言模板。

---投诉渠道---
列出具体可用的投诉渠道，包括：机构名称、联系方式（如12333、12315等）、办事流程简述。

---追问建议---
给出3个用户基于此问题最可能想继续追问的问题，每行一个，不加序号和多余符号，格式示例：
押金被克扣了怎么维权？
可以拒绝签这种合同吗？
要去哪里投诉才有效？

注意事项：
1. 如果涉及复杂诉讼，必须提醒用户咨询线下专业律师
2. 保持语言简洁易懂，避免过于专业的术语
3. 重点关注大学生常见场景：租房纠纷、求职劳动合同、三方协议等
4. 不得提供违法建议，始终在法律框架内给出建议`

const DOCUMENT_SYSTEM_PROMPT = `你是一位专业的法律文书撰写助手。根据用户提供的信息，生成规范的法律文书。

文书生成要求：
1. 格式规范，符合法律文书标准
2. 内容完整，包含必要的法律要素
3. 语言严谨，使用法律用语
4. 如有缺失信息，在[   ]中标注需要填写的内容

直接输出文书内容，不需要额外说明。`

const DISPUTE_SYSTEM_PROMPT = `你是一位专业的法律博弈策略顾问，帮助大学生预判维权时对方可能的应对策略。

根据用户描述的文书内容，请按以下格式输出（必须包含两个部分）：

---对方可能的狡辩---
模拟对方（房东/雇主/中介）收到文书后最可能说的2-3条狡辩理由，语气真实，像真实对话。

---学长教你怎么拆招---
针对上述每条狡辩，给出具体的反驳话术和法律依据，让学生有备无患。语气要像学长教弟弟妹妹一样亲切有力。`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const apiKey = Deno.env.get('INTEGRATIONS_API_KEY')
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: '服务配置错误，请联系管理员' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { messages, mode } = await req.json()

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(
        JSON.stringify({ error: '请提供对话消息' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 仅在法律咨询模式下执行 RAG 检索（文书生成/博弈模式不需要）
    let ragContext = ''
    if (mode !== 'document' && mode !== 'dispute') {
      const userQuery = messages[messages.length - 1]?.content ?? ''
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      const ragDocs = await searchLegalDocs(userQuery, apiKey, supabaseUrl, serviceKey)
      if (ragDocs.length > 0) {
        ragContext = '\n\n【知识库检索结果 - 请优先基于以下法律条文回答】\n' +
          ragDocs.map((d, i) =>
            `${i + 1}. ${d.source || d.title}\n${d.content}`
          ).join('\n\n')
      }
    }

    // 根据模式选择系统提示词，并注入 RAG 上下文
    const systemPrompt = (mode === 'document' ? DOCUMENT_SYSTEM_PROMPT
      : mode === 'dispute' ? DISPUTE_SYSTEM_PROMPT
      : LEGAL_SYSTEM_PROMPT) + ragContext

    const apiMessages = [
      { role: 'system', content: systemPrompt },
      ...messages.map((m: { role: string; content: string }) => ({
        role: m.role,
        content: m.content,
      }))
    ]

    // 从环境变量读取模型名
    // gateway 兼容 OpenAI API 格式（embedding 端点用 text-embedding-3-small 可验证），
    // 因此 chat completions 使用 OpenAI 格式模型名；可通过 CHAT_MODEL 环境变量覆盖
    const modelName = Deno.env.get('CHAT_MODEL') || 'gpt-4o-mini'

    // 使用 AbortController 代替 AbortSignal.timeout()，兼容所有 Deno 版本
    const chatController = new AbortController()
    const chatTimer = setTimeout(() => chatController.abort(), 25000) // 25 秒超时，适应秒搭函数执行限制

    let response: Response
    try {
      response = await fetch(TEXT_API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Gateway-Authorization': `Bearer ${apiKey}`, // gateway 唯一认证头
        },
        body: JSON.stringify({
          model: modelName,
          messages: apiMessages,
          stream: false, // 关闭流式，直接返回完整 JSON
        }),
        signal: chatController.signal,
      })
    } finally {
      clearTimeout(chatTimer)
    }

    if (!response.ok) {
      const errText = await response.text()
      console.error(`文本API错误 [${response.status}]:`, errText)
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: '请求过于频繁，请稍后再试' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      if (response.status === 401 || response.status === 403) {
        return new Response(
          JSON.stringify({ error: 'API密钥无效，请联系管理员' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'API余额不足，请联系管理员' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      if (response.status === 400) {
        return new Response(
          JSON.stringify({ error: '请求参数错误，请检查输入内容' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      return new Response(
        JSON.stringify({ error: 'AI服务暂时不可用，请稍后再试' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 非流式响应：直接解析完整 JSON
    const respData = await response.json()
    const fullContent: string = respData?.choices?.[0]?.message?.content
      || respData?.choices?.[0]?.delta?.content
      || ''

    return new Response(
      JSON.stringify({ content: fullContent, rag_used: ragContext.length > 0 }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('法律咨询错误:', error)
    return new Response(
      JSON.stringify({ error: '服务异常，请稍后重试' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
