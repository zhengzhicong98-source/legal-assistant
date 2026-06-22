import { supabase } from '@/client/supabase'
import type { RightsCenter, ContractReview, LegalKnowledge, CasePost, CaseCategory, QuestionStat, ConsultHistory, SavedLaw } from './types'

// ==================== 维权机构 ====================

/** 获取所有省份列表 */
export async function getProvinces(): Promise<string[]> {
  const { data, error } = await supabase.rpc('get_provinces')
  console.log('getProvinces result:', JSON.stringify({ data, error }))  // 加这行
  if (error || !data) return []
  return data.map((d: { province: string }) => d.province)
}

/** 按省份获取城市列表 */
export async function getCitiesByProvince(province: string): Promise<string[]> {
  const { data, error } = await supabase.rpc('get_cities_by_province', { p_province: province })
  if (error || !data) return []
  return data.map((d: { city: string }) => d.city)
}

/** 按省市和类型查询维权机构 */
export async function getRightsCenters(params: {
  province?: string
  city?: string
  type?: string
}): Promise<RightsCenter[]> {
  let query = supabase
    .from('rights_centers')
    .select('*')
    .order('type')
    .limit(50)

  if (params.province) query = query.eq('province', params.province)
  if (params.city) query = query.eq('city', params.city)
  if (params.type) query = query.eq('type', params.type)

  const { data, error } = await query
  if (error || !data) return []
  return Array.isArray(data) ? data : []
}

// ==================== 合同审查记录 ====================

/** 保存合同审查记录 */
export async function saveContractReview(params: {
  file_url?: string
  file_name?: string
  review_result?: object
}): Promise<ContractReview | null> {
  const { data, error } = await supabase
    .from('contract_reviews')
    .insert({
      file_url: params.file_url || null,
      file_name: params.file_name || null,
      review_result: params.review_result || null,
    })
    .select()
    .maybeSingle()

  if (error) return null
  return data
}

// ==================== 法律知识库 ====================

/** 获取知识库文档列表（含 has_embedding 状态，通过 Edge Function 返回） */
export async function getLegalKnowledgeDocs(): Promise<LegalKnowledge[]> {
  const { data, error } = await supabase
    .from('legal_knowledge')
    .select('id, title, source, category, content, created_at')
    .order('created_at', { ascending: false })
    .limit(300)

  if (error || !data) return []

  // 查询哪些记录已有 embedding
  const { data: embeddedRows } = await supabase
    .from('legal_knowledge')
    .select('id')
    .not('embedding', 'is', null)

  const embeddedIds = new Set((embeddedRows ?? []).map((r: { id: string }) => r.id))
  return (data as LegalKnowledge[]).map(d => ({
    ...d,
    has_embedding: embeddedIds.has(d.id),
  }))
}

/** 获取未向量化的知识库条目（embedding IS NULL） */
export async function getPendingEmbeddingDocs(): Promise<LegalKnowledge[]> {
  const { data, error } = await supabase
    .from('legal_knowledge')
    .select('id, title, source, category, content, created_at')
    .is('embedding', null)
    .order('created_at', { ascending: true })
    .limit(300)

  if (error || !data) return []
  return (data as LegalKnowledge[]).map(d => ({ ...d, has_embedding: false }))
}

/** 删除知识库条目 */
export async function deleteLegalKnowledge(id: string): Promise<boolean> {
  const { error } = await supabase
    .from('legal_knowledge')
    .delete()
    .eq('id', id)

  return !error
}

// ==================== 案例分享广场 ====================

/** 获取帖子列表（支持分类筛选和排序） */
export async function getCasePosts(params?: {
  category?: CaseCategory | '全部'
  sort?: 'latest' | 'hottest'
  limit?: number
  offset?: number
}): Promise<CasePost[]> {
  const { category = '全部', sort = 'latest', limit = 10, offset = 0 } = params ?? {}
  let query = supabase
    .from('case_posts')
    .select('*')
    .eq('status', 'published')

  if (category !== '全部') query = query.eq('category', category)

  if (sort === 'hottest') {
    query = query.order('likes_count', { ascending: false }).order('created_at', { ascending: false })
  } else {
    query = query.order('created_at', { ascending: false })
  }

  query = query.range(offset, offset + limit - 1)

  const { data, error } = await query
  if (error || !data) return []
  return data as CasePost[]
}

/** 发布案例帖子 */
export async function createCasePost(data: {
  user_id: string
  nickname: string
  category: CaseCategory
  title: string
  content: string
  question?: string
  solution?: string
  result?: CasePost['result']
  is_anonymous?: boolean
}): Promise<CasePost | null> {
  const { data: result, error } = await supabase
    .from('case_posts')
    .insert({
      user_id: data.user_id,
      nickname: data.is_anonymous ? '匿名学长' : data.nickname,
      category: data.category,
      title: data.title,
      content: data.content,
      question: data.question || null,
      solution: data.solution || null,
      result: data.result || null,
      is_anonymous: data.is_anonymous ?? true,
      status: 'published',
    })
    .select()
    .single()

  if (error) return null
  return result as CasePost
}

/** 获取案例详情 */
export async function getCasePostDetail(id: string): Promise<CasePost | null> {
  const { data, error } = await supabase
    .from('case_posts')
    .select('*')
    .eq('id', id)
    .eq('status', 'published')
    .single()

  if (error || !data) return null
  return data as CasePost
}

/** 获取当前用户对某帖子的点赞/收藏状态 */
export async function getUserCaseReactions(
  postId: string,
  userId: string
): Promise<{ liked: boolean; saved: boolean }> {
  const [{ data: likeData }, { data: saveData }] = await Promise.all([
    supabase.from('case_likes').select('id').eq('post_id', postId).eq('user_id', userId).single(),
    supabase.from('case_saves').select('id').eq('post_id', postId).eq('user_id', userId).single(),
  ])
  return { liked: !!likeData, saved: !!saveData }
}

/** 点赞 / 取消点赞 */
export async function toggleLike(postId: string, userId: string, liked: boolean): Promise<boolean> {
  if (liked) {
    const { error } = await supabase.from('case_likes').delete().eq('post_id', postId).eq('user_id', userId)
    return !error
  } else {
    const { error } = await supabase.from('case_likes').insert({ post_id: postId, user_id: userId })
    return !error
  }
}

/** 收藏 / 取消收藏 */
export async function toggleSave(postId: string, userId: string, saved: boolean): Promise<boolean> {
  if (saved) {
    const { error } = await supabase.from('case_saves').delete().eq('post_id', postId).eq('user_id', userId)
    return !error
  } else {
    const { error } = await supabase.from('case_saves').insert({ post_id: postId, user_id: userId })
    return !error
  }
}

// ==================== 热点问题统计 ====================

function getCurrentWeekInfo(): { year: number; week: number } {
  const now = new Date()
  const start = new Date(now.getFullYear(), 0, 1)
  const diff = now.getTime() - start.getTime()
  const oneDay = 1000 * 60 * 60 * 24
  const dayOfYear = Math.floor(diff / oneDay)
  const weekNumber = Math.ceil((dayOfYear + start.getDay()) / 7)
  return { year: now.getFullYear(), week: weekNumber }
}

/** 记录问题统计（upsert） */
export async function recordQuestion(questionText: string, category?: string): Promise<boolean> {
  const { year, week } = getCurrentWeekInfo()
  const trimmed = questionText.trim().slice(0, 100)

  // 尝试先查询是否存在
  const { data: existing } = await supabase
    .from('question_stats')
    .select('id, count')
    .eq('question_text', trimmed)
    .eq('week_number', week)
    .eq('year', year)
    .maybeSingle()

  if (existing) {
    const { error } = await supabase
      .from('question_stats')
      .update({ count: existing.count + 1, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
    return !error
  }

  const { error } = await supabase.from('question_stats').insert({
    question_text: trimmed,
    category: category || null,
    week_number: week,
    year,
  })
  return !error
}

/** 获取本周热点问题 Top 5 */
export async function getWeeklyHotQuestions(): Promise<QuestionStat[]> {
  const { year, week } = getCurrentWeekInfo()
  const { data, error } = await supabase
    .from('question_stats')
    .select('*')
    .eq('year', year)
    .eq('week_number', week)
    .order('count', { ascending: false })
    .limit(5)

  if (error || !data) return []
  return data as QuestionStat[]
}

// ==================== 咨询历史 ====================

/** 获取咨询历史 */
export async function getConsultHistory(userId: string, limit = 20, offset = 0): Promise<ConsultHistory[]> {
  const { data, error } = await supabase
    .from('consult_history')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error || !data) return []
  return Array.isArray(data) ? data : []
}

/** 保存咨询记录 */
export async function saveConsultHistory(
  userId: string,
  question: string,
  answer: string,
  ragUsed: boolean,
  responseTimeMs?: number
) {
  const tokenEstimate = Math.ceil((question.length + answer.length) / 4)
  const { data, error } = await supabase
    .from('consult_history')
    .insert({
      user_id: userId,
      question,
      answer,
      rag_used: ragUsed,
      response_time_ms: responseTimeMs || null,
      rag_hit_count: ragUsed ? 1 : 0,
      token_estimate: tokenEstimate,
    })
    .select('id')
    .single()
  return { id: data?.id, error }
}

/** 提交用户对 AI 回答的反馈（1=有用，-1=没用） */
export async function submitFeedback(historyId: string, feedback: 1 | -1) {
  const { error } = await supabase
    .from('consult_history')
    .update({ feedback })
    .eq('id', historyId)
  return { error }
}

/** 记录 AI 调用日志 */
export async function logAiCall(params: {
  userId?: string
  functionName: string
  model: string
  promptLength: number
  responseLength: number
  responseTimeMs: number
  ragUsed: boolean
  ragHitCount: number
  success: boolean
  errorMessage?: string
}) {
  const tokenEstimate = Math.ceil((params.promptLength + params.responseLength) / 4)
  const { error } = await supabase.from('ai_call_logs').insert({
    user_id: params.userId || null,
    function_name: params.functionName,
    model: params.model,
    prompt_length: params.promptLength,
    response_length: params.responseLength,
    token_estimate: tokenEstimate,
    response_time_ms: params.responseTimeMs,
    rag_used: params.ragUsed,
    rag_hit_count: params.ragHitCount,
    success: params.success,
    error_message: params.errorMessage || null,
  })
  return { error }
}

/** 获取用户统计摘要（用于个人中心展示） */
export async function getConsultStats(userId: string) {
  const { data } = await supabase
    .from('consult_history')
    .select('feedback, response_time_ms, rag_used')
    .eq('user_id', userId)

  const total = data?.length || 0
  const positive = data?.filter(d => d.feedback === 1).length || 0
  const negative = data?.filter(d => d.feedback === -1).length || 0
  const avgResponseTime = data ? data.reduce((sum, d) => sum + (d.response_time_ms || 0), 0) / (total || 1) : 0
  const ragHitRate = data ? data.filter(d => d.rag_used).length / (total || 1) : 0

  return { total, positive, negative, avgResponseTime: Math.round(avgResponseTime), ragHitRate }
}

/** 获取全局统计数据（管理员看板） */
export async function getAdminStats() {
  const [{ data: consultData }, { data: logData }] = await Promise.all([
    supabase.from('consult_history').select('feedback, response_time_ms, rag_used'),
    supabase.from('ai_call_logs').select('*').order('created_at', { ascending: false }).limit(20),
  ])

  const total = consultData?.length || 0
  const positive = consultData?.filter(d => d.feedback === 1).length || 0
  const negative = consultData?.filter(d => d.feedback === -1).length || 0
  const feedbackTotal = positive + negative
  const avgResponseTime = total > 0
    ? (consultData ? Math.round(consultData.reduce((sum, d) => sum + (d.response_time_ms || 0), 0) / total) : 0)
    : 0
  const ragHitRate = total > 0
    ? (consultData ? consultData.filter(d => d.rag_used).length / total : 0)
    : 0

  return {
    total,
    positive,
    negative,
    feedbackTotal,
    avgResponseTime,
    ragHitRate,
    recentLogs: (logData || []) as Array<{
      id: string
      function_name: string
      model: string
      response_time_ms: number
      success: boolean
      error_message: string | null
      created_at: string
    }>,
  }
}

/** 删除咨询记录 */
export async function deleteConsultHistory(id: string): Promise<boolean> {
  const { error } = await supabase.from('consult_history').delete().eq('id', id)
  return !error
}

// ==================== 收藏法条 ====================

/** 获取收藏法条 */
export async function getSavedLaws(userId: string): Promise<SavedLaw[]> {
  const { data, error } = await supabase
    .from('saved_laws')
    .select('*, legal_knowledge!saved_laws_knowledge_id_fkey(*)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error || !data) return []
  return Array.isArray(data) ? data : []
}

/** 取消收藏法条 */
export async function removeSavedLaw(id: string): Promise<boolean> {
  const { error } = await supabase.from('saved_laws').delete().eq('id', id)
  return !error
}

/** 收藏法条 */
export async function saveLaw(userId: string, knowledgeId: string): Promise<boolean> {
  const { error } = await supabase.from('saved_laws').insert({ user_id: userId, knowledge_id: knowledgeId })
  return !error
}

// ==================== 用户统计 ====================

/** 获取用户统计数据 */
export async function getUserStats(userId: string): Promise<{ consultCount: number; savedCount: number; caseCount: number }> {
  const [consultRes, savedRes, caseRes] = await Promise.all([
    supabase.from('consult_history').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    supabase.from('saved_laws').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    supabase.from('case_posts').select('id', { count: 'exact', head: true }).eq('user_id', userId),
  ])
  return {
    consultCount: consultRes.count || 0,
    savedCount: savedRes.count || 0,
    caseCount: caseRes.count || 0,
  }
}
