import { corsHeaders } from '../_shared/cors.ts'

const MULTIMODAL_API = 'https://app-bar9rto6gwsh-api-k93RZBjPykEa-gateway.appmiaoda.com/v2/chat/completions'

const SYSTEM_PROMPT = `你是一位深耕中国劳动法与民法典的资深律师，专门为大学生提供合同法律审查服务。

审查合同时，请按以下JSON格式输出结果（只输出JSON，不要其他内容）：
{
  "summary": "整体评价摘要（2-3句话）",
  "risk_level": "高风险|中风险|低风险",
  "score": 85,
  "risks": [
    {
      "clause": "问题条款原文或简述",
      "risk_level": "高风险|中风险|低风险",
      "description": "风险说明",
      "law_basis": "相关法律条文，如《民法典》第XXX条",
      "plain_translation": "人话翻译：用一句大白话解释这个条款的实际意思，例如：意思就是房东随时可以把你赶走",
      "suggestion": "修改建议或维权建议"
    }
  ],
  "advice": "总体建议（包括是否可以签署、注意事项）",
  "cross_issues": "多份文件关联问题说明（如无多份文件则为空字符串）"
}

评分规则：
- 满分100分，每个高风险条款扣15分，每个中风险条款扣8分，每个低风险条款扣3分
- 得分低于60分表示合同极度危险，应强烈建议不签

常见霸王条款识别重点：
1. 租房合同：无故克扣押金、提前解约不赔偿、禁止合理装饰、房东可随时驱逐
2. 劳动合同：试用期过长、无故解除不赔偿、竞业限制无补偿、培训费设置陷阱
3. 三方协议：违约金过高、单方面修改权、就业信息造假免责条款
4. 跨文档分析：识别多份文件之间的矛盾，如合同约定与清单标注不符

如合同图片内容不清晰无法识别，在summary中说明并提示用户重新上传清晰图片，risks数组可为空，score给50。`

Deno.serve(async (req) => {
  // 处理CORS预检请求
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

    const { image_url, image_base64, image_urls, file_name } = await req.json()

    if (!image_url && !image_base64 && (!image_urls || image_urls.length === 0)) {
      return new Response(
        JSON.stringify({ error: '请提供合同图片' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 构建图片内容（支持多文件）
    const imageContents = []
    if (image_base64) {
      imageContents.push({ type: 'image_url', image_url: { url: image_base64 } })
    } else if (image_url) {
      imageContents.push({ type: 'image_url', image_url: { url: image_url } })
    } else if (image_urls && Array.isArray(image_urls)) {
      for (const url of image_urls.slice(0, 5)) {
        imageContents.push({ type: 'image_url', image_url: { url } })
      }
    }

    const fileCount = imageContents.length
    const fileDesc = fileCount > 1 ? `${fileCount}份相关文件（需跨文档关联分析）` : (file_name || '合同文件')

    const messages = [
      {
        role: 'system',
        content: [{ type: 'text', text: SYSTEM_PROMPT }]
      },
      {
        role: 'user',
        content: [
          { type: 'text', text: `请审查这份合同（文件名：${fileDesc}），识别其中的霸王条款和法律风险，按JSON格式输出结果。${fileCount > 1 ? '请重点识别多份文件之间的矛盾与关联风险。' : ''}` },
          ...imageContents
        ]
      }
    ]

    const response = await fetch(MULTIMODAL_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Gateway-Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ messages }),
    })

    if (!response.ok) {
      const errText = await response.text()
      console.error('文心API错误:', errText)
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: '请求过于频繁，请稍后再试' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'API余额不足，请联系管理员' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      return new Response(
        JSON.stringify({ error: 'AI服务暂时不可用，请稍后再试' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 收集流式响应
    const reader = response.body?.getReader()
    const decoder = new TextDecoder()
    let fullContent = ''

    if (reader) {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split('\n').filter(line => line.trim())
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6)
            if (data === '[DONE]') continue
            try {
              const parsed = JSON.parse(data)
              const delta = parsed?.choices?.[0]?.delta?.content
              if (delta) fullContent += delta
            } catch {
              // 忽略解析错误
            }
          }
        }
      }
    }

    // 解析JSON结果
    let reviewResult
    try {
      // 提取JSON内容（可能包含```json```包裹）
      const jsonMatch = fullContent.match(/```json\s*([\s\S]*?)\s*```/) || fullContent.match(/(\{[\s\S]*\})/)
      const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : fullContent
      reviewResult = JSON.parse(jsonStr.trim())
    } catch {
      // 如果无法解析JSON，返回原始文本作为摘要
      reviewResult = {
        summary: fullContent || '合同审查完成，但结果格式异常，请重试。',
        risk_level: '中风险',
        risks: [],
        advice: '建议咨询专业律师进行详细分析。'
      }
    }

    return new Response(
      JSON.stringify({ result: reviewResult }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('合同审查错误:', error)
    return new Response(
      JSON.stringify({ error: '服务异常，请稍后重试' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
