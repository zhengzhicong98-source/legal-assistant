// 内容安全过滤模块：两层过滤（输入黑名单 + 输出AI审核）
// 任何异常默认放行，不阻断主流程

// ============ 关键词黑名单 ============
// 覆盖：暴力伤害、色情、诈骗引导、教唆违法等场景
// 结合法律助手面向大学生的定位
const KEYWORD_BLACKLIST: string[] = [
  // 暴力伤害
  '杀人', '自杀', '自残', '跳楼', '砍人', '捅人', '炸', '毒杀', '谋杀',
  '怎么杀人', '如何自杀', '自杀方法', '怎么自杀', '自残方法', '杀人方法',
  '买凶', '雇凶', '报复社会', '无差别攻击', '伤害他人',
  // 色情淫秽
  '色情', '卖淫', '嫖娼', '淫秽', '裸照', '偷拍', '强奸', '性侵',
  '约炮', '援交', '福利姬', '裸聊', '包养', '性交易', '色情服务',
  '换妻', '群交', 'SM调教', '性奴', '迷奸', '下药',
  // 诈骗引导
  '诈骗', '骗术', '骗钱', '骗保', '伪造证件', '假证', '套现', '洗钱',
  '怎么诈骗', '诈骗技巧', '诈骗方法', '如何骗', '骗钱技巧', '诈骗教程',
  '冒充公检法', '杀猪盘', '电信诈骗', '网络诈骗', '短信诈骗',
  // 教唆违法 / 毒品
  '贩毒', '吸毒', '制毒', '运毒', '毒品', '冰毒', '海洛因', '大麻',
  '怎么吸毒', '吸毒方法', '怎么贩毒', '制毒方法', '毒品买卖',
  // 黑客 / 网络犯罪
  '黑客', '入侵', '攻击网站', '破解', '盗刷', '盗号', '木马',
  '社工库', '撞库', 'DDoS攻击', '漏洞利用', '免杀',
  // 赌博
  '赌博', '开设赌场', '赌球', '网络赌博', '赌资', '抽头',
  '怎么赌博', '赌博技巧', '赌博网站', '赌博代理',
  // 盗窃抢劫
  '抢劫', '盗窃', '偷东西', '偷车', '入室盗窃', '拦路抢劫',
  '怎么抢劫', '抢劫方法', '盗窃技巧', '入室盗窃方法',
  // 其他严重违法
  '纵火', '投毒', '绑架', '勒索', '走私', '非法持枪', '买卖枪支',
  '人口贩卖', '器官买卖', '伪造货币', '非法集资', '传销',
  // 针对大学生的特殊场景
  '校园贷', '裸条', '套路贷', '高利贷', '砍头息',
  '代考', '代写论文', '论文代写', '考试作弊', '替考',
  '刷单诈骗', '高薪兼职诈骗', '兼职诈骗', '虚假招聘',
]

export interface InputCheckResult {
  blocked: boolean
  reason?: string
}

export interface OutputCheckResult {
  safe: boolean
  reason?: string
}

/** 输入内容关键词黑名单检测 */
export function checkInput(text: string): InputCheckResult {
  try {
    const normalized = text.toLowerCase().trim()
    if (!normalized) return { blocked: false }

    for (const keyword of KEYWORD_BLACKLIST) {
      if (normalized.includes(keyword)) {
        return { blocked: true, reason: `命中违禁词：${keyword}` }
      }
    }
    return { blocked: false }
  } catch {
    // 任何异常默认放行
    return { blocked: false }
  }
}

/** AI输出内容合规审核（异步调用glm-4-flash判断） */
export async function checkOutput(
  text: string,
  apiKey: string
): Promise<OutputCheckResult> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 5000)

    const response = await fetch(
      'https://open.bigmodel.cn/api/paas/v4/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'glm-4-flash',
          messages: [
            {
              role: 'user',
              content:
                `请审核以下AI回复内容是否合规。回复面向大学生法律咨询服务。\n\n` +
                `需要拦截的内容包括：暴力伤害、色情淫秽、诈骗引导、教唆违法、毒品、赌博等违法违规内容。\n\n` +
                `待审核内容：\n${text.slice(0, 2000)}\n\n` +
                `请只返回JSON格式，不要返回其他内容：\n` +
                `{"safe": true/false, "reason": "如果unsafe，说明原因"}`,
            },
          ],
        }),
        signal: controller.signal,
      }
    )

    clearTimeout(timer)

    if (!response.ok) {
      // API调用失败，默认放行
      return { safe: true }
    }

    const data = await response.json()
    const content = data?.choices?.[0]?.message?.content || ''

    // 尝试提取并解析JSON
    try {
      // 先尝试完整解析（模型可能直接返回JSON）
      const result = JSON.parse(content)
      if (typeof result.safe === 'boolean') {
        return { safe: result.safe, reason: result.reason }
      }
    } catch {
      // 解析失败，尝试提取JSON片段
      const jsonMatch =
        content.match(/```json\s*([\s\S]*?)\s*```/) ||
        content.match(/\{[\s\S]*?\}/)
      if (jsonMatch) {
        try {
          const result = JSON.parse(jsonMatch[0])
          if (typeof result.safe === 'boolean') {
            return { safe: result.safe, reason: result.reason }
          }
        } catch {
          // 继续默认放行
        }
      }
    }

    // 所有解析尝试失败，默认放行
    return { safe: true }
  } catch {
    // 超时或其他异常，默认放行
    return { safe: true }
  }
}
