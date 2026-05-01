import { supabase } from '@/client/supabase'
import type { RightsCenter, ContractReview, LegalKnowledge } from './types'

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
