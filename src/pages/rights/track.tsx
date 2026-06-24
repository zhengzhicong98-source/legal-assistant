import { useState, useEffect, useCallback } from 'react'
import Taro from '@tarojs/taro'
import { useAuth } from '@/contexts/AuthContext'
import { withRouteGuard } from '@/components/RouteGuard'
import { getRightsCases, createRightsCase, updateRightsCaseStatus, getRightsTimeline, addTimelineNode } from '@/db/api'

const STATUS_LIST = ['准备中', '投诉阶段', '调解阶段', '仲裁阶段', '诉讼阶段', '已结案'] as const
const STATUS_COLORS: Record<string, string> = {
  '准备中': 'bg-gray-100 text-gray-600',
  '投诉阶段': 'bg-blue-100 text-blue-700',
  '调解阶段': 'bg-amber-100 text-amber-700',
  '仲裁阶段': 'bg-orange-100 text-orange-700',
  '诉讼阶段': 'bg-red-100 text-red-700',
  '已结案': 'bg-green-100 text-green-700',
}

function TrackPage() {
  const { user } = useAuth()
  const [cases, setCases] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('劳动纠纷')
  const [description, setDescription] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [timelines, setTimelines] = useState<Record<string, any[]>>({})
  const [newNode, setNewNode] = useState('')

  const loadCases = useCallback(async () => {
    if (!user) return
    const data = await getRightsCases(user.id)
    setCases(data)
    setLoading(false)
  }, [user])

  useEffect(() => { loadCases() }, [loadCases])

  const handleCreate = async () => {
    if (!title.trim() || !user) return
    const id = await createRightsCase({ user_id: user.id, title: title.trim(), category, description: description.trim() })
    if (id) { setShowForm(false); setTitle(''); setDescription(''); loadCases(); Taro.showToast({ title: '创建成功', icon: 'success' }) }
  }

  const handleStatusChange = async (caseId: string, newStatus: string) => {
    await updateRightsCaseStatus(caseId, newStatus)
    loadCases()
  }

  const loadTimeline = async (caseId: string) => {
    if (timelines[caseId]) return
    const data = await getRightsTimeline(caseId)
    setTimelines(prev => ({ ...prev, [caseId]: data }))
  }

  const handleAddNode = async (caseId: string) => {
    if (!newNode.trim()) return
    const ok = await addTimelineNode({ case_id: caseId, title: newNode.trim(), content: '' })
    if (ok) { setNewNode(''); const data = await getRightsTimeline(caseId); setTimelines(prev => ({ ...prev, [caseId]: data })) }
  }

  return (
    <div className="min-h-screen bg-background pb-8">
      <div className="flex items-center justify-between px-4 py-3 bg-card border-b border-border">
        <div className="flex items-center gap-2">
          <div className="i-mdi-arrow-left text-2xl text-foreground" onClick={() => Taro.navigateBack()} />
          <span className="text-2xl font-semibold text-foreground">维权进度追踪</span>
        </div>
        <button className="text-xl text-primary font-medium" onClick={() => setShowForm(!showForm)}>
          {showForm ? '取消' : '+ 新建'}
        </button>
      </div>

      <div className="px-4 pt-4">
        {/* 新建表单 */}
        {showForm && (
          <div className="bg-card rounded-2xl border border-border p-4 mb-4">
            <p className="text-xl font-semibold mb-3">新建维权案例</p>
            <div className="flex flex-col gap-3">
              <input className="border border-border rounded-lg px-4 py-3 text-xl bg-background" placeholder="案例标题（如：某公司拖欠工资维权）"
                value={title} onInput={e => setTitle((e as any).detail?.value ?? (e as any).target?.value ?? '')} />
              <div className="flex gap-2">
                {['劳动纠纷', '租房纠纷', '消费维权', '其他'].map(c => (
                  <div key={c} className={`px-3 py-1.5 rounded-full text-base ${category === c ? 'bg-primary text-primary-foreground' : 'bg-secondary'}`}
                    onClick={() => setCategory(c)}>{c}</div>
                ))}
              </div>
              <textarea className="border border-border rounded-lg px-4 py-3 text-xl bg-background" rows={3} placeholder="问题描述…"
                value={description} onInput={e => setDescription((e as any).detail?.value ?? (e as any).target?.value ?? '')} />
              <button className="bg-primary text-primary-foreground rounded-xl py-3 text-xl font-medium" onClick={handleCreate}>创建案例</button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="text-center py-16"><div className="i-mdi-loading animate-spin text-3xl text-muted-foreground" /></div>
        ) : cases.length === 0 ? (
          <div className="flex flex-col items-center pt-16 text-muted-foreground">
            <div className="i-mdi-timeline-text-outline text-5xl opacity-40 mb-3" />
            <p className="text-xl">暂无维权案例</p>
            <p className="text-xl mt-1">点击右上角「新建」开始追踪维权进度</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {cases.map(c => (
              <div key={c.id} className="bg-card rounded-xl border border-border overflow-hidden">
                <div className="px-4 py-3" onClick={() => { setExpandedId(expandedId === c.id ? null : c.id); if (expandedId !== c.id) loadTimeline(c.id) }}>
                  <div className="flex items-start justify-between mb-2">
                    <p className="text-xl font-semibold text-foreground flex-1">{c.title}</p>
                    <span className={`text-base px-2 py-0.5 rounded-full flex-shrink-0 ml-2 ${STATUS_COLORS[c.status]}`}>{c.status}</span>
                  </div>
                  <div className="flex items-center gap-3 text-base text-muted-foreground">
                    <span>{c.category}</span>
                    <span>更新于 {new Date(c.updated_at).toLocaleDateString('zh-CN')}</span>
                  </div>
                </div>
                {expandedId === c.id && (
                  <div className="px-4 pb-4 border-t border-border">
                    {/* 状态切换 */}
                    <div className="flex flex-wrap gap-2 mt-3 mb-4">
                      {STATUS_LIST.map(s => (
                        <div key={s} className={`px-3 py-1.5 rounded-full text-base transition-all ${c.status === s ? STATUS_COLORS[s] + ' font-medium' : 'bg-secondary'}`}
                          onClick={() => handleStatusChange(c.id, s)}>{s}</div>
                      ))}
                    </div>
                    {/* 时间线 */}
                    {(timelines[c.id] || []).length > 0 ? (
                      <div className="relative pl-6 border-l-2 border-primary/30">
                        {(timelines[c.id] || []).map((n: any) => (
                          <div key={n.id} className="mb-3 last:mb-0 relative">
                            <div className={`absolute -left-[25px] w-4 h-4 rounded-full border-2 ${n.is_completed ? 'bg-primary border-primary' : 'bg-white border-primary/30'}`} />
                            <p className={`text-xl ${n.is_completed ? 'text-foreground' : 'text-muted-foreground'}`}>{n.title}</p>
                            <p className="text-base text-muted-foreground">{n.node_date}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xl text-muted-foreground mb-3">暂无进度节点，添加一个吧</p>
                    )}
                    {/* 添加节点 */}
                    <div className="flex gap-2">
                      <input className="flex-1 border border-border rounded-lg px-3 py-2 text-xl bg-background" placeholder="添加进度节点…"
                        value={newNode} onInput={e => setNewNode((e as any).detail?.value ?? (e as any).target?.value ?? '')} />
                      <button className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-xl" onClick={() => handleAddNode(c.id)}>+</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default withRouteGuard(TrackPage)
