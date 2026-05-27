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

// ==================== 案例分享广场 ====================

export type CaseCategory = '租房' | '劳动' | '消费' | '其他'
export type CaseResult = '维权成功' | '协商解决' | '待处理'

export interface CasePost {
  id: string
  user_id: string
  nickname: string
  category: CaseCategory
  title: string
  content: string
  question: string | null
  solution: string | null
  result: CaseResult | null
  likes_count: number
  saves_count: number
  is_anonymous: boolean
  status: 'published' | 'hidden'
  created_at: string
}

export interface CaseLike {
  id: string
  post_id: string
  user_id: string
  created_at: string
}

export interface CaseSave {
  id: string
  post_id: string
  user_id: string
  created_at: string
}

// ==================== 热点问题统计 ====================

export interface QuestionStat {
  id: string
  question_text: string
  count: number
  category: string | null
  week_number: number | null
  year: number | null
  updated_at: string
}

// ==================== 用户资料 ====================

export interface Profile {
  id: string
  openid: string | null
  nickname: string
  avatar_url: string | null
  created_at: string
  updated_at: string
}

// ==================== 咨询历史 ====================

export interface ConsultHistory {
  id: string
  user_id: string
  question: string
  answer: string
  rag_used: boolean
  created_at: string
}

// ==================== 收藏法条 ====================

export interface SavedLaw {
  id: string
  user_id: string
  knowledge_id: string
  created_at: string
  legal_knowledge: LegalKnowledge
}
