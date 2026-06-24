import { useState, useCallback, useEffect } from 'react'
import Taro, { useReachBottom } from '@tarojs/taro'
import { useAuth } from '@/contexts/AuthContext'
import { withRouteGuard } from '@/components/RouteGuard'
import { getConsultHistory, deleteConsultHistory } from '@/db/api'
import type { ConsultHistory } from '@/db/types'

const PAGE_SIZE = 20

function formatTime(iso: string): string {
  const d = new Date(iso)
  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** 生成咨询记录导出文本 */
function buildExportText(records: ConsultHistory[]): string {
  const header = `法律助手 - 咨询记录导出\n导出时间：${new Date().toLocaleString('zh-CN')}\n共 ${records.length} 条记录\n${'═'.repeat(30)}\n\n`
  const body = records.map((r, i) => {
    const time = formatTime(r.created_at)
    const ragLabel = r.rag_used ? ' [已引用法条]' : ''
    return `【${i + 1}】${time}${ragLabel}\nQ: ${r.question}\nA: ${r.answer}\n${'─'.repeat(20)}`
  }).join('\n\n')
  return header + body
}

function HistoryPage() {
  const { user } = useAuth()
  const [records, setRecords] = useState<ConsultHistory[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [offset, setOffset] = useState(0)
  const [exporting, setExporting] = useState(false)

  const loadData = useCallback(async (reset = false) => {
    if (!user) return
    setLoading(true)
    const currentOffset = reset ? 0 : offset
    const data = await getConsultHistory(user.id, PAGE_SIZE, currentOffset)
    if (reset) {
      setRecords(data)
      setOffset(PAGE_SIZE)
    } else {
      setRecords(prev => [...prev, ...data])
      setOffset(currentOffset + PAGE_SIZE)
    }
    setHasMore(data.length === PAGE_SIZE)
    setLoading(false)
  }, [user, offset])

  useEffect(() => { loadData(true) }, [user])

  // 导出时才加载全量记录（避免每次挂载 200 条查询）
  const loadAllForExport = useCallback(async () => {
    if (!user) return
    const data = await getConsultHistory(user.id, 200, 0)
    setAllRecords(data)
    return data
  }, [user])

  useReachBottom(() => {
    if (!loading && hasMore) loadData(false)
  })

  const handleDelete = (id: string) => {
    Taro.showModal({
      title: '确认删除',
      content: '删除后无法恢复',
      confirmText: '删除',
      cancelText: '取消',
      success: async ({ confirm }) => {
        if (!confirm) return
        const ok = await deleteConsultHistory(id)
        if (ok) {
          setRecords(prev => prev.filter(r => r.id !== id))
          Taro.showToast({ title: '已删除', icon: 'success' })
        }
      },
    })
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      const records = await loadAllForExport()
      if (!records || records.length === 0) {
        Taro.showToast({ title: '暂无记录可导出', icon: 'none' })
        return
      }
      const text = buildExportText(records)
      if (Taro.getEnv() === Taro.ENV_TYPE.WEB) {
        // H5: 下载为文本文件
        const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url; a.download = `法律助手咨询记录_${new Date().toISOString().slice(0, 10)}.txt`; a.click()
        URL.revokeObjectURL(url)
      } else {
        // 小程序: 复制到剪贴板
        await Taro.setClipboardData({ data: text })
        Taro.showModal({
          title: '导出成功',
          content: '咨询记录已复制到剪贴板，可粘贴到备忘录或发送给朋友保存。',
          showCancel: false,
        })
      }
    } catch {
      Taro.showToast({ title: '导出失败', icon: 'none' })
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="min-h-screen bg-background pb-8">
      <div className="flex items-center justify-between px-4 py-3 bg-card border-b border-border">
        <div className="flex items-center gap-2">
          <div className="i-mdi-arrow-left text-2xl text-foreground" onClick={() => Taro.navigateBack()} />
          <span className="text-2xl font-semibold text-foreground">我的咨询记录</span>
        </div>
        {records.length > 0 && (
          <button type="button"
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-secondary text-primary text-xl"
            onClick={handleExport}
            disabled={exporting}
          >
            <div className={`text-xl ${exporting ? 'i-mdi-loading animate-spin' : 'i-mdi-download-outline'}`} />
            <span>{exporting ? '导出中' : '导出'}</span>
          </button>
        )}
      </div>

      <div className="px-4 pt-4">
        {records.length === 0 && !loading ? (
          <div className="flex flex-col items-center pt-16 text-muted-foreground">
            <div className="i-mdi-history text-4xl opacity-40 mb-3" />
            <p className="text-xl">暂无咨询记录</p>
            <p className="text-xl mt-1">去法律咨询提问吧</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {records.map(record => (
              <div key={record.id} className="bg-card rounded-xl border border-border overflow-hidden">
                <div
                  className="flex items-start gap-3 px-4 py-3 active:opacity-70 transition-opacity"
                  onClick={() => setExpandedId(expandedId === record.id ? null : record.id)}
                >
                  <div className="flex-1">
                    <p className="text-xl font-medium text-foreground leading-snug line-clamp-2">{record.question}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xl text-muted-foreground">{formatTime(record.created_at)}</span>
                      {record.rag_used && (
                        <span className="px-2 py-0.5 rounded bg-primary/10 text-primary text-xl">引用法条</span>
                      )}
                    </div>
                  </div>
                  <div className={`i-mdi-chevron-down text-2xl text-muted-foreground transition-transform flex-shrink-0 mt-1 ${expandedId === record.id ? 'rotate-180' : ''}`} />
                </div>
                {expandedId === record.id && (
                  <div className="px-4 pb-3 border-t border-border">
                    <p className="text-xl text-muted-foreground leading-relaxed mt-3 whitespace-pre-line line-clamp-6">{record.answer}</p>
                    <div className="flex items-center gap-1 mt-3 text-xl text-destructive" onClick={() => handleDelete(record.id)}>
                      <div className="i-mdi-trash-can-outline text-xl" />
                      <span>删除记录</span>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {loading && (
              <div className="text-center py-4 text-muted-foreground text-xl">
                <div className="i-mdi-loading animate-spin inline-block mr-2" />加载中...
              </div>
            )}
            {!hasMore && records.length > 0 && (
              <div className="text-center py-4 text-muted-foreground text-xl">已加载全部记录</div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default withRouteGuard(HistoryPage)
