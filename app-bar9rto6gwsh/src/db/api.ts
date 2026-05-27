import { supabase } from '@/client/supabase'
import type { RightsCenter, ContractReview, LegalKnowledge, CasePost, CaseCategory, QuestionStat, ConsultHistory, SavedLaw } from './types'

// ==================== 维权机构 ====================

/** 获取所有省份列表 */
export async function getProvinces(): Promise<string[]> {
  const { data, error } = await supabase
    .from('rights_centers')
    .select('province')
    .order('province')

  if (error || !data) return []
  const provinces = [...new Set(data.map((d) => d.province))]
  return provinces
}

/** 按省份获取城市列表 */
export async function getCitiesByProvince(province: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('rights_centers')
    .select('city')
    .eq('province', province)
    .order('city')

  if (error || !data) return []
  const cities = [...new Set(data.map((d) => d.city))]
  return cities
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
export async function saveConsultHistory(userId: string, question: string, answer: string, ragUsed: boolean): Promise<boolean> {
  const { error } = await supabase.from('consult_history').insert({
    user_id: userId,
    question,
    answer,
    rag_used: ragUsed,
  })
  return !error
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
