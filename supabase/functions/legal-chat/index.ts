import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { ok, err, handleOptions, logRequest } from '../_shared/response.ts'

async function sendAlert(
  supabaseUrl: string,
  level: 'error' | 'warning' | 'info',
  title: string,
  message: string,
  details?: Record<string, unknown>
) {
  try {
    await fetch(`${supabaseUrl}/functions/v1/alert-notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ level, title, message, details }),
    })
  } catch {
    console.error('[legal-chat] 告警发送失败')
  }
}

const TEXT_API = 'https://open.bigmodel.cn/api/paas/v4/chat/completions'
const EMBED_API = 'https://open.bigmodel.cn/api/paas/v4/embeddings'

/** 调用 Embedding API 获取查询向量（失败时静默返回 null，不阻断正常对话） */
async function getQueryEmbedding(text: string, apiKey: string): Promise<number[] | null> {
  try {
    const embedController = new AbortController()
    const embedTimer = setTimeout(() => embedController.abort(), 8000)
    let response: Response
    try {
      response = await fetch(EMBED_API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ model: 'embedding-3', input: text }),
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
interface RagDoc {
  id: string
  title: string
  source: string
  content: string
}

async function searchLegalDocs(
  query: string,
  apiKey: string,
  supabaseUrl: string,
  serviceKey: string
): Promise<RagDoc[]> {
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
    return (data as RagDoc[])
  } catch {
    return []
  }
}

const LEGAL_SYSTEM_PROMPT = `你是一位深耕中国劳动法与民法典的资深律师助手，专门为大学生提供法律咨询服务，人称"法律学长"。

在回答时，请严格按以下格式输出（必须包含这六个部分，使用---分隔符）：

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

---信源引用---
逐条列出本回答引用的法律条文原文及来源，格式：
• 来源《法律名称》第X条：该条完整原文内容
每条引用独占一行，以•开头，只列本次实际引用的条文，不得虚构或补充未引用的条文。

---追问建议---
给出3个用户基于此问题最可能想继续追问的问题，每行一个，不加序号和多余符号，格式示例：
押金被克扣了怎么维权？
可以拒绝签这种合同吗？
要去哪里投诉才有效？

注意事项：
1. 如果涉及复杂诉讼，必须提醒用户咨询线下专业律师
2. 保持语言简洁易懂，避免过于专业的术语
3. 重点关注大学生常见场景：租房纠纷、求职劳动合同、三方协议等
4. 不得提供违法建议，始终在法律框架内给出建议
5. 【防幻觉强制规则】严格遵守以下限制，违反即视为失败回答：
   - 只能引用确实存在于中国现行法律体系中的条文，禁止编造或虚构任何法律条文、条文编号或条文内容
   - 若当前问题在现行法律中没有明确依据，必须在[结论与分析]开头礼貌告知："抱歉，暂时未找到针对这个问题的明确法律依据，建议您咨询专业律师获取准确解答"，并跳过---信源引用---部分
   - 在---信源引用---中只列本次回答中实际引用过的条文，禁止补充与回答无关的条文`

const DOCUMENT_SYSTEM_PROMPT = `你是一位专业的法律文书撰写助手。根据用户提供的信息，生成规范的法律文书。

文书生成要求：
1. 格式规范，符合法律文书标准
2. 内容完整，包含必要的法律要素
3. 语言严谨，使用法律用语
4. 如有缺失信息，在[   ]中标注需要填写的内容

【防幻觉规则】只能引用确实存在的法律条文；若无相关依据，请在文书中注明"（建议咨询律师确认适用法条）"，严禁编造法律条文。

直接输出文书内容，不需要额外说明。`

const DISPUTE_SYSTEM_PROMPT = `你是一位专业的法律博弈策略顾问，帮助大学生预判维权时对方可能的应对策略。

根据用户描述的文书内容，请按以下格式输出（必须包含两个部分）：

---对方可能的狡辩---
模拟对方（房东/雇主/中介）收到文书后最可能说的2-3条狡辩理由，语气真实，像真实对话。

---学长教你怎么拆招---
针对上述每条狡辩，给出具体的反驳话术和法律依据，让学生有备无患。语气要像学长教弟弟妹妹一样亲切有力。

【防幻觉规则】引用的所有法律依据必须真实存在于中国现行法律体系中，严禁编造条文编号或条文内容。`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleOptions()

  try {
    logRequest(req, 'legal-chat')

    const apiKey = Deno.env.get('INTEGRATIONS_API_KEY')
    if (!apiKey) return err('服务配置错误，请联系管理员', 500)

    const body = await req.json()
    const { messages, mode, stream: streamReq } = body
    const useStream = streamReq === true

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return err('请提供对话消息', 400)
    }

    // 仅在法律咨询模式下执行 RAG 检索
    let ragContext = ''
    let legalRefs: { id: string; title: string; source: string }[] = []
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
        legalRefs = ragDocs.map(d => ({ id: d.id, title: d.title, source: d.source }))
      }
    }

    // 根据模式选择系统提示词，并注入 RAG 上下文
    const systemPrompt = (mode === 'document' ? DOCUMENT_SYSTEM_PROMPT
      : mode === 'dispute' ? DISPUTE_SYSTEM_PROMPT
      : LEGAL_SYSTEM_PROMPT) + ragContext

    // 修复：智谱 AI 不支持 messages 里的 system role
    // system prompt 单独通过 system 字段传入
    const apiMessages = messages.map((m: { role: string; content: string }) => ({
      role: m.role,
      content: m.content,
    }))

    const modelName = Deno.env.get('CHAT_MODEL') || 'glm-4-flash'

    const chatController = new AbortController()
    const chatTimer = setTimeout(() => chatController.abort(), 55000)

    let response: Response
    try {
      try {
        response = await fetch(TEXT_API, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: modelName,
            messages: apiMessages,
            system: systemPrompt,
            stream: useStream,
          }),
          signal: chatController.signal,
        })
      } finally {
        clearTimeout(chatTimer)
      }
    } catch (fetchError) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        await sendAlert(supabaseUrl, 'error', 'AI调用超时', 'legal-chat 调用智谱AI超时（55s）', { mode })
        return err('AI响应超时，请稍后重试', 504)
      }
      await sendAlert(supabaseUrl, 'error', 'AI调用网络错误', String(fetchError))
      return err('网络错误，请稍后重试', 500)
    }

    if (!response.ok) {
      const errText = await response.text()
      console.error(`[legal-chat] 文本API错误 [${response.status}]:`, errText)
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
      if (response.status === 429) {
        await sendAlert(supabaseUrl, 'warning', 'AI限流', '智谱AI返回429，请求过于频繁')
        return err('请求过于频繁，请稍后再试', 429)
      }
      if (response.status === 401 || response.status === 403) {
        await sendAlert(supabaseUrl, 'error', 'AI密钥无效', `智谱AI返回${response.status}`)
        return err('API密钥无效，请联系管理员', 500)
      }
      if (response.status === 402) {
        await sendAlert(supabaseUrl, 'error', 'AI余额不足', '智谱AI返回402，余额不足')
        return err('API余额不足，请联系管理员', 402)
      }
      if (response.status === 400) return err('请求参数错误，请检查输入内容', 400)
      await sendAlert(supabaseUrl, 'error', 'AI服务异常', `智谱AI返回${response.status}`, { errText: errText.slice(0, 200) })
      return err('AI服务暂时不可用，请稍后再试', 500)
    }

    const ragUsed = ragContext.length > 0

    // 非流式模式（小程序端）：聚合智谱返回为完整 JSON，前端按 data.content 读取
    if (!useStream) {
      const result = await response.json()
      const content = result?.choices?.[0]?.message?.content ?? ''
      return ok({ content, rag_used: ragUsed, legal_refs: legalRefs })
    }

    // 流式透传：直接将智谱 AI 的 SSE 流返回给前端
    // 同时在流结束后注入 rag_used 信息

    // 将原始流转换，在末尾追加 rag_used 信息
    const { readable, writable } = new TransformStream()
    const writer = writable.getWriter()
    const encoder = new TextEncoder()

    ;(async () => {
      try {
        const reader = response.body!.getReader()
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          await writer.write(value)
        }
        // 流结束后追加 rag_used 元数据和匹配法条引用
        await writer.write(encoder.encode(`data: ${JSON.stringify({rag_used: ragUsed, legal_refs: legalRefs})}\n\n`))
        await writer.write(encoder.encode('data: [DONE]\n\n'))
      } catch (e) {
        console.error('流式传输错误:', e)
      } finally {
        await writer.close()
      }
    })()

    return new Response(readable, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'X-Accel-Buffering': 'no',
      },
    })
  } catch (error) {
    console.error('[legal-chat] 错误:', error)
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    if (supabaseUrl) {
      await sendAlert(supabaseUrl, 'error', 'Edge Function崩溃', String(error))
    }
    return err('服务异常，请稍后重试', 500)
  }
})