import { useState, useCallback, useMemo } from 'react'
import Taro from '@tarojs/taro'
import { callEdgeFunction } from '@/utils/callEdgeFunction'

interface EvidenceItem {
  key: string
  label: string
  desc: string
  icon: string
  importance: 'critical' | 'important' | 'helpful'
}

interface Scenario {
  id: string
  name: string
  icon: string
  evidences: EvidenceItem[]
}

const SCENARIOS: Scenario[] = [
  {
    id: 'deposit',
    name: '房东不退押金',
    icon: 'i-mdi-home-alert-outline',
    evidences: [
      { key: 'contract', label: '租房合同', desc: '包含押金条款的租赁合同原件或照片', icon: 'i-mdi-file-document-outline', importance: 'critical' },
      { key: 'payment', label: '押金转账记录', desc: '微信/支付宝/银行转账截图，金额和时间清晰', icon: 'i-mdi-bank-transfer', importance: 'critical' },
      { key: 'checkout', label: '退房记录', desc: '退房日期的书面凭证或双方沟通记录', icon: 'i-mdi-calendar-check-outline', importance: 'critical' },
      { key: 'room_photos', label: '退房时房屋照片', desc: '退房当天拍摄，证明房屋无损坏', icon: 'i-mdi-camera-outline', importance: 'critical' },
      { key: 'chat', label: '催退押金的聊天记录', desc: '与房东关于退押金的微信/短信记录截图', icon: 'i-mdi-chat-outline', importance: 'important' },
      { key: 'checklist', label: '设施交接清单', desc: '入住时签署的设施状态确认单', icon: 'i-mdi-clipboard-list-outline', importance: 'helpful' },
      { key: 'witness', label: '见证人信息', desc: '退房时在场人员的联系方式', icon: 'i-mdi-account-group-outline', importance: 'helpful' },
    ],
  },
  {
    id: 'salary',
    name: '公司拖欠工资',
    icon: 'i-mdi-currency-cny',
    evidences: [
      { key: 'contract', label: '劳动合同', desc: '载明工资金额和支付日期的劳动合同', icon: 'i-mdi-file-sign', importance: 'critical' },
      { key: 'payslip', label: '工资条/薪资记录', desc: '历史工资条或银行流水截图', icon: 'i-mdi-receipt', importance: 'critical' },
      { key: 'work_proof', label: '在职证明', desc: '工牌、工作邮件、内部系统截图等', icon: 'i-mdi-badge-account-outline', importance: 'critical' },
      { key: 'owed_record', label: '欠薪记录', desc: '拖欠期间的银行流水（未收到工资的证明）', icon: 'i-mdi-bank-outline', importance: 'important' },
      { key: 'chat', label: '沟通记录', desc: '与HR/老板关于薪资的聊天截图', icon: 'i-mdi-chat-outline', importance: 'important' },
      { key: 'attendance', label: '考勤记录', desc: '证明工作天数的打卡记录或邮件', icon: 'i-mdi-clock-check-outline', importance: 'helpful' },
    ],
  },
  {
    id: 'consumer',
    name: '消费维权（质量问题）',
    icon: 'i-mdi-shield-alert-outline',
    evidences: [
      { key: 'receipt', label: '购买凭证/发票', desc: '购物小票、电子发票或订单截图', icon: 'i-mdi-receipt', importance: 'critical' },
      { key: 'defect_photos', label: '商品瑕疵照片/视频', desc: '清晰展示质量问题的照片或视频', icon: 'i-mdi-camera-outline', importance: 'critical' },
      { key: 'product', label: '商品实物或包装', desc: '保留商品和包装，含生产日期批次号', icon: 'i-mdi-package-variant', importance: 'important' },
      { key: 'complaint_chat', label: '与商家的沟通记录', desc: '投诉/要求退款的聊天截图', icon: 'i-mdi-chat-outline', importance: 'important' },
      { key: 'medical', label: '就医记录（如适用）', desc: '因商品问题受伤的医院记录', icon: 'i-mdi-hospital-box-outline', importance: 'helpful' },
    ],
  },
  {
    id: 'training',
    name: '培训机构退款',
    icon: 'i-mdi-school-outline',
    evidences: [
      { key: 'contract', label: '培训合同', desc: '含退款条款的服务合同', icon: 'i-mdi-file-document-outline', importance: 'critical' },
      { key: 'payment', label: '付款记录', desc: '缴费转账记录或收据', icon: 'i-mdi-bank-transfer', importance: 'critical' },
      { key: 'attendance', label: '上课记录', desc: '实际参课次数证明，如签到表、课表截图', icon: 'i-mdi-clock-check-outline', importance: 'important' },
      { key: 'refund_apply', label: '退款申请记录', desc: '书面或聊天记录中的退款申请', icon: 'i-mdi-chat-outline', importance: 'important' },
      { key: 'advertising', label: '宣传材料', desc: '机构当时的宣传页面截图（与实际不符时使用）', icon: 'i-mdi-image-outline', importance: 'helpful' },
    ],
  },
]

const IMPORTANCE_CONFIG = {
  critical: { label: '关键证据', color: 'text-destructive', bg: 'bg-red-50', border: 'border-red-200' },
  important: { label: '重要证据', color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200' },
  helpful: { label: '辅助证据', color: 'text-primary', bg: 'bg-secondary', border: 'border-border' },
}

const DISCLAIMER = '本回复由AI生成，仅供参考，不构成正式法律建议。若情况紧急请咨询专业律师。'

export default function Evidence() {
  // 从 URL 参数读取当前步骤和场景 ID
  const routerParams = useMemo(() => {
    const instance = Taro.getCurrentInstance()
    return instance?.router?.params || {}
  }, [])

  const currentStep = useMemo(() => routerParams.step || 'list', [routerParams])
  const scenarioId = useMemo(() => routerParams.scenarioId || '', [routerParams])

  // 根据 URL 参数查找场景
  const selectedScenario = useMemo(() => {
    if (!scenarioId) return null
    return SCENARIOS.find(s => s.id === scenarioId) || null
  }, [scenarioId])

  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [aiSuggestion, setAiSuggestion] = useState('')
  const [loadingAi, setLoadingAi] = useState(false)

  const toggleCheck = (key: string) => {
    setChecked(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const handleGetAdvice = useCallback(async () => {
    if (!selectedScenario) return
    const allEvidence = selectedScenario.evidences
    const have = allEvidence.filter(e => checked.has(e.key)).map(e => e.label)
    const missing = allEvidence.filter(e => !checked.has(e.key))
    const criticalMissing = missing.filter(e => e.importance === 'critical').map(e => e.label)

    if (missing.length === 0) {
      Taro.showToast({ title: '证据已齐全，可以维权了！', icon: 'success' })
      return
    }

    setLoadingAi(true)
    setAiSuggestion('')
    try {
      const prompt = `我在处理"${selectedScenario.name}"的维权问题。\n\n已有证据：${have.length > 0 ? have.join('、') : '暂无'}\n关键证据缺失：${criticalMissing.join('、') || '无'}\n\n请针对我的具体情况：\n1. 评估当前证据的充分程度\n2. 指出最紧迫需要补充的证据及采集方法\n3. 给出1-2条立即可行的证据采集建议`

      const { data, error } = await callEdgeFunction<{ content?: string }>('legal-chat', {
        body: { messages: [{ role: 'user', content: prompt }], mode: 'chat' },
      })
      if (error) {
        Taro.showToast({ title: '获取建议失败', icon: 'none' })
        return
      }
      const rawContent: string = data?.content || ''
      const mainContent = rawContent.split('---法律依据---')[0].replace('[结论与分析]', '').trim()
      setAiSuggestion(mainContent)
    } catch {
      Taro.showToast({ title: '网络异常，请稍后重试', icon: 'none' })
    } finally {
      setLoadingAi(false)
    }
  }, [selectedScenario, checked])

  // 证据清单页（step=detail）
  if (currentStep === 'detail' && selectedScenario) {
    const criticalCount = selectedScenario.evidences.filter(e => e.importance === 'critical').length
    const checkedCritical = selectedScenario.evidences.filter(e => e.importance === 'critical' && checked.has(e.key)).length
    const readyPercent = Math.round((checked.size / selectedScenario.evidences.length) * 100)

    return (
      <div className="min-h-screen bg-background">
        <div className="px-4 py-4">
          {/* 场景标题 */}
          <div className="flex items-center gap-3 mb-4">
            <div className={`${selectedScenario.icon} text-3xl text-primary`} />
            <div>
              <p className="text-xl font-semibold text-foreground">{selectedScenario.name}</p>
              <p className="text-xl text-muted-foreground">共 {selectedScenario.evidences.length} 项证据，已勾选 {checked.size} 项</p>
            </div>
          </div>

          {/* 进度条 */}
          <div className="mb-4">
            <div className="flex justify-between mb-1">
              <span className="text-xl text-foreground">关键证据：{checkedCritical}/{criticalCount}</span>
              <span className={`text-xl font-medium ${readyPercent >= 80 ? 'text-primary' : readyPercent >= 50 ? 'text-amber-600' : 'text-destructive'}`}>
                {readyPercent}% 已备齐
              </span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${readyPercent >= 80 ? 'bg-primary' : readyPercent >= 50 ? 'bg-amber-400' : 'bg-destructive'}`}
                style={{ width: `${readyPercent}%` }}
              />
            </div>
          </div>

          {/* 证据列表 */}
          {(['critical', 'important', 'helpful'] as const).map(importance => {
            const items = selectedScenario.evidences.filter(e => e.importance === importance)
            const config = IMPORTANCE_CONFIG[importance]
            return (
              <div key={importance} className="mb-4">
                <p className={`text-xl font-medium ${config.color} mb-2`}>{config.label}</p>
                {items.map(item => (
                  <div
                    key={item.key}
                    className={`flex items-start gap-3 px-4 py-3 rounded-xl border mb-2 transition-all ${checked.has(item.key) ? 'border-primary bg-secondary' : `${config.bg} ${config.border}`}`}
                    onClick={() => toggleCheck(item.key)}
                  >
                    <div className={`w-6 h-6 rounded-full border-2 flex-shrink-0 mt-0.5 flex items-center justify-center transition-all ${checked.has(item.key) ? 'border-primary bg-primary' : 'border-muted-foreground bg-transparent'}`}>
                      {checked.has(item.key) && <div className="i-mdi-check text-xl text-primary-foreground" />}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <div className={`${item.icon} text-xl ${checked.has(item.key) ? 'text-primary' : 'text-muted-foreground'}`} />
                        <p className={`text-xl font-medium ${checked.has(item.key) ? 'text-primary' : 'text-foreground'}`}>{item.label}</p>
                      </div>
                      <p className="text-xl text-muted-foreground mt-1 leading-relaxed">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            )
          })}

          {/* AI建议 */}
          <button
            type="button"
            className="flex items-center justify-center leading-none gap-2 w-full bg-primary rounded-xl mb-3"
            style={{ opacity: loadingAi ? 0.5 : 1 }}
            onClick={handleGetAdvice}
          >
            <div className="py-4 flex items-center gap-2">
              {loadingAi ? (
                <div className="i-mdi-loading text-2xl text-primary-foreground animate-spin" />
              ) : (
                <div className="i-mdi-robot-outline text-2xl text-primary-foreground" />
              )}
              <span className="text-xl text-primary-foreground">{loadingAi ? '分析中...' : '学长帮我评估证据'}</span>
            </div>
          </button>

          {aiSuggestion && (
            <div className="bg-card rounded-2xl border border-border p-4 mb-3">
              <div className="flex items-center gap-2 mb-3">
                <div className="i-mdi-robot-outline text-xl text-primary" />
                <p className="text-xl font-semibold text-foreground">学长的证据建议</p>
              </div>
              <p className="text-xl text-foreground leading-relaxed whitespace-pre-wrap">{aiSuggestion}</p>
              <div className="flex items-start gap-2 mt-3 px-3 py-2 bg-muted rounded-xl">
                <div className="i-mdi-information-outline text-xl text-muted-foreground flex-shrink-0 mt-0.5" />
                <p className="text-xl text-muted-foreground leading-relaxed">{DISCLAIMER}</p>
              </div>
            </div>
          )}

          <button
            type="button"
            className="flex items-center justify-center leading-none gap-2 w-full border border-border bg-background rounded-xl"
            onClick={() => Taro.navigateBack()}
          >
            <div className="py-3 flex items-center gap-2">
              <div className="i-mdi-arrow-left text-2xl text-foreground" />
              <span className="text-xl text-foreground">返回选择场景</span>
            </div>
          </button>
        </div>
      </div>
    )
  }

  // 场景选择页（默认）
  return (
    <div className="min-h-screen bg-background">
      <div className="px-4 py-4">
        <p className="text-xl text-muted-foreground mb-6 leading-relaxed">大学生维权最常见的失败原因就是没有证据。选择你的场景，学长帮你逐一核对必要证据。</p>
        <div className="flex flex-col gap-3">
          {SCENARIOS.map(scenario => (
            <div
              key={scenario.id}
              className="bg-card rounded-2xl border border-border p-4 flex items-center gap-4 transition-all active:scale-95"
              onClick={() => Taro.navigateTo({ url: `/pages/evidence/index?step=detail&scenarioId=${scenario.id}` })}
            >
              <div className={`${scenario.icon} text-3xl text-primary flex-shrink-0`} />
              <div className="flex-1">
                <p className="text-xl font-semibold text-foreground">{scenario.name}</p>
                <p className="text-xl text-muted-foreground mt-1">
                  {scenario.evidences.filter(e => e.importance === 'critical').length} 项关键证据 · {scenario.evidences.length} 项总清单
                </p>
              </div>
              <div className="i-mdi-chevron-right text-2xl text-muted-foreground" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
