import { corsHeaders } from '../_shared/cors.ts'
import { ok, err, handleOptions, logRequest } from '../_shared/response.ts'

const MULTIMODAL_API = 'https://open.bigmodel.cn/api/paas/v4/chat/completions'

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

const COMPARE_PROMPT = `你是一位深耕中国劳动法与民法典的资深律师，专门为大学生提供合同对比审查服务。

现在有两份合同（合同A 和 合同B），请对比分析差异，按以下JSON格式输出（只输出JSON）：
{
  "summary": "两份合同的整体差异评价（2-3句话）",
  "risk_level": "高风险|中风险|低风险",
  "score": 85,
  "differences": [
    {
      "field": "涉及条款/事项",
      "contract_a": "合同A的约定",
      "contract_b": "合同B的约定",
      "advantage": "A更有利|B更有利|无明显差异",
      "analysis": "差异的法律含义及建议"
    }
  ],
  "risks_a": [{"clause": "条款原文", "risk_level": "高风险|中风险|低风险", "description": "风险说明", "suggestion": "建议"}],
  "risks_b": [{"clause": "条款原文", "risk_level": "高风险|中风险|低风险", "description": "风险说明", "suggestion": "建议"}],
  "advice": "综合建议：推荐选择哪份合同及理由"
}

重点对比维度：租金金额/押金条款、租期/续租、违约责任、解除条件、维修责任、争议解决方式。`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleOptions()

  try {
    logRequest(req, 'contract-review')

    const apiKey = Deno.env.get('INTEGRATIONS_API_KEY')
    if (!apiKey) return err('服务配置错误，请联系管理员', 500)

    const { image_url, image_base64, image_urls, file_name, mode, image_urls_b } = await req.json()
    const isCompare = mode === 'compare'

    if (!image_url && !image_base64 && (!image_urls || image_urls.length === 0)) {
      return err('请提供合同图片', 400)
    }

    // 构建图片内容
    const imageContents: { type: string; image_url: { url: string } }[] = []
    if (image_base64) {
      imageContents.push({ type: 'image_url', image_url: { url: image_base64 } })
    } else if (image_url) {
      imageContents.push({ type: 'image_url', image_url: { url: image_url } })
    } else if (image_urls && Array.isArray(image_urls)) {
      for (const url of image_urls.slice(0, 5)) {
        imageContents.push({ type: 'image_url', image_url: { url } })
      }
    }

    // 对比模式：加上合同B的图片
    if (isCompare && image_urls_b && Array.isArray(image_urls_b)) {
      for (const url of image_urls_b.slice(0, 5)) {
        imageContents.push({ type: 'image_url', image_url: { url } })
      }
    }

    const fileCount = imageContents.length
    const fileDesc = fileCount > 1 ? `${fileCount}份文件` : (file_name || '合同文件')

    const messages = [
      {
        role: 'system',
        content: [{ type: 'text', text: isCompare ? COMPARE_PROMPT : SYSTEM_PROMPT }]
      },
      {
        role: 'user',
        content: [
          { type: 'text', text: isCompare
            ? `请对比这两份合同（前面为合同A，后面为合同B），找出差异条款并按JSON格式输出结果。`
            : `请审查这份合同（文件名：${fileDesc}），识别其中的霸王条款和法律风险，按JSON格式输出结果。${fileCount > 1 ? '请重点识别多份文件之间的矛盾与关联风险。' : ''}`
          },
          ...imageContents
        ]
      }
    ]

    const response = await fetch(MULTIMODAL_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ messages }),
    })

    if (!response.ok) {
      const errText = await response.text()
      console.error('[contract-review] API错误:', errText)
      if (response.status === 429) return err('请求过于频繁，请稍后再试', 429)
      if (response.status === 402) return err('API余额不足，请联系管理员', 402)
      return err('AI服务暂时不可用，请稍后再试', 500)
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

    return ok({ result: reviewResult })
  } catch (error) {
    console.error('[contract-review] 错误:', error)
    return err('服务异常，请稍后重试', 500)
  }
})
