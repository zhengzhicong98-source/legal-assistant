// 维权机构类型
export interface RightsCenter {
  id: string
  province: string
  city: string
  name: string
  type: '劳动仲裁委' | '消费者协会' | '法律援助中心'
  address: string | null
  phone: string | null
  website: string | null
  process: string | null
  working_hours: string | null
  created_at: string
}

// 合同审查记录类型
export interface ContractReview {
  id: string
  file_url: string | null
  file_name: string | null
  review_result: ContractReviewResult | null
  created_at: string
}

// 合同审查结果类型
export interface ContractReviewResult {
  summary: string
  risk_level: '高风险' | '中风险' | '低风险'
  risks: RiskItem[]
  advice: string
}

// 风险条款类型
export interface RiskItem {
  clause: string
  risk_level: '高风险' | '中风险' | '低风险'
  description: string
  law_basis: string
  suggestion: string
}

// 聊天消息类型
export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  ragUsed?: boolean
}

// 法律咨询回复结构
export interface LegalChatResponse {
  answer: string
  law_basis?: string
  speech_template?: string
  complaint_channel?: string
}

// 法律知识库条目类型
export interface LegalKnowledge {
  id: string
  title: string
  source: string
  category: string
  content: string
  created_at: string
  has_embedding?: boolean
}
