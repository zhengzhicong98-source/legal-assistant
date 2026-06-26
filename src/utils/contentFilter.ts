// 前端输入预检黑名单（简化版，与后端保持一致）
export const FRONTEND_BLACKLIST = [
  '杀人', '自杀', '自残', '砍人', '捅人', '毒杀', '谋杀',
  '色情', '卖淫', '嫖娼', '淫秽', '裸照', '偷拍', '强奸', '性侵',
  '约炮', '援交', '裸聊', '包养', '性交易',
  '诈骗', '骗术', '骗钱', '骗保', '伪造证件', '假证', '套现', '洗钱',
  '贩毒', '吸毒', '制毒', '毒品', '冰毒', '海洛因',
  '黑客', '入侵', '盗刷', '盗号',
  '赌博', '开设赌场', '赌球', '网络赌博',
  '抢劫', '盗窃', '偷东西', '偷车',
  '纵火', '投毒', '绑架', '勒索', '走私', '非法持枪',
  '校园贷', '裸条', '套路贷', '代考', '代写论文', '论文代写',
  '刷单诈骗', '高薪兼职诈骗',
]

export interface FrontendCheckResult {
  ok: boolean
  reason?: string
}

/** 前端输入预检：长度 + 违禁词 */
export function checkFrontendInput(text: string): FrontendCheckResult {
  const trimmed = text.trim()

  if (trimmed.length > 500) {
    return { ok: false, reason: '问题过长，请控制在500字以内' }
  }

  const normalized = trimmed.toLowerCase()
  const hit = FRONTEND_BLACKLIST.find((k) => normalized.includes(k))
  if (hit) {
    return { ok: false, reason: '您的问题包含不当内容，请重新描述' }
  }

  return { ok: true }
}
