import { useState, useCallback, useMemo } from 'react'
import Taro from '@tarojs/taro'
import { callEdgeFunction } from '@/utils/callEdgeFunction'

interface Template {
  id: string
  name: string
  desc: string
  icon: string
  fields: Field[]
  prompt: string
}

interface Field {
  key: string
  label: string
  placeholder: string
  required: boolean
}

const TEMPLATES: Template[] = [
  {
    id: 'labor_termination',
    name: '解除劳动合同通知书',
    desc: '员工主动辞职或被动解雇时使用',
    icon: 'i-mdi-briefcase-remove-outline',
    fields: [
      { key: 'company', label: '公司名称', placeholder: '请输入公司全称', required: true },
      { key: 'employee', label: '员工姓名', placeholder: '请输入员工姓名', required: true },
      { key: 'position', label: '职位', placeholder: '请输入职位名称', required: true },
      { key: 'date', label: '通知日期', placeholder: '如：2024年3月1日', required: true },
      { key: 'last_day', label: '最后工作日', placeholder: '如：2024年3月31日', required: true },
      { key: 'reason', label: '解除原因', placeholder: '请简述解除原因', required: false },
    ],
    prompt: '请生成一份《解除劳动合同通知书》，信息如下：',
  },
  {
    id: 'rent_deposit',
    name: '押金退还催告函',
    desc: '房东未按期退还押金时使用',
    icon: 'i-mdi-home-alert-outline',
    fields: [
      { key: 'tenant', label: '租客姓名', placeholder: '请输入姓名', required: true },
      { key: 'landlord', label: '房东姓名', placeholder: '请输入姓名', required: true },
      { key: 'address', label: '租房地址', placeholder: '请输入完整地址', required: true },
      { key: 'deposit', label: '押金金额', placeholder: '如：3000元', required: true },
      { key: 'checkout_date', label: '退房日期', placeholder: '如：2024年2月28日', required: true },
      { key: 'deadline', label: '催告截止日期', placeholder: '如：2024年3月15日', required: true },
    ],
    prompt: '请生成一份《押金退还催告函》，信息如下：',
  },
  {
    id: 'debt_collection',
    name: '欠款催收函',
    desc: '催促债务人还款时使用',
    icon: 'i-mdi-currency-cny',
    fields: [
      { key: 'creditor', label: '债权人姓名', placeholder: '请输入姓名', required: true },
      { key: 'debtor', label: '债务人姓名', placeholder: '请输入姓名', required: true },
      { key: 'amount', label: '欠款金额', placeholder: '如：5000元', required: true },
      { key: 'due_date', label: '约定还款日', placeholder: '如：2024年1月1日', required: true },
      { key: 'notice_date', label: '发函日期', placeholder: '如：2024年3月1日', required: true },
      { key: 'repay_deadline', label: '要求还款截止日', placeholder: '如：2024年3月15日', required: true },
    ],
    prompt: '请生成一份《欠款催收函》，信息如下：',
  },
  {
    id: 'labor_complaint',
    name: '劳动仲裁申请书',
    desc: '申请劳动仲裁维权时使用',
    icon: 'i-mdi-gavel',
    fields: [
      { key: 'applicant', label: '申请人姓名', placeholder: '请输入姓名', required: true },
      { key: 'company', label: '被申请人（公司）', placeholder: '请输入公司全称', required: true },
      { key: 'start_date', label: '入职日期', placeholder: '如：2023年7月1日', required: true },
      { key: 'end_date', label: '离职日期', placeholder: '如：2024年2月29日', required: true },
      { key: 'claim', label: '仲裁请求', placeholder: '如：支付拖欠工资5000元', required: true },
      { key: 'facts', label: '事实与理由', placeholder: '简述纠纷经过', required: true },
    ],
    prompt: '请生成一份《劳动仲裁申请书》，信息如下：',
  },
]

function parseDisputeReply(content: string) {
  const argsMatch = content.match(/---对方可能的狡辩---([\s\S]*?)(?=---|$)/)
  const counterMatch = content.match(/---学长教你怎么拆招---([\s\S]*?)(?=---|$)/)
  return {
    args: argsMatch ? argsMatch[1].trim() : content,
    counter: counterMatch ? counterMatch[1].trim() : '',
  }
}

export default function Documents() {
  // 从 URL 参数读取当前步骤和选中模版
  const routerParams = useMemo(() => {
    const instance = Taro.getCurrentInstance()
    return instance?.router?.params || {}
  }, [])

  const currentStep = useMemo(() => routerParams.step || 'list', [routerParams])
  const templateId = useMemo(() => routerParams.templateId || '', [routerParams])

  // 根据 URL 参数中的 templateId 查找模版
  const selectedTemplate = useMemo(() => {
    if (!templateId) return null
    return TEMPLATES.find(t => t.id === templateId) || null
  }, [templateId])

  const [formData, setFormData] = useState<Record<string, string>>({})
  const [generating, setGenerating] = useState(false)
  const [generatedDoc, setGeneratedDoc] = useState(() => {
    // 从 storage 恢复生成的文书（结果步骤时读取）
    if (currentStep === 'result') {
      try { return Taro.getStorageSync('document_result') || '' } catch { return '' }
    }
    return ''
  })
  const [disputeContent, setDisputeContent] = useState('')
  const [loadingDispute, setLoadingDispute] = useState(false)
  const [showDispute, setShowDispute] = useState(false)

  const setField = (key: string, value: string) => {
    setFormData(prev => ({ ...prev, [key]: value }))
  }

  const handleGenerate = useCallback(async () => {
    if (!selectedTemplate) return
    const missingFields = selectedTemplate.fields
      .filter(f => f.required && !formData[f.key]?.trim())
      .map(f => f.label)

    if (missingFields.length > 0) {
      Taro.showToast({ title: `请填写：${missingFields[0]}`, icon: 'none' })
      return
    }

    setGenerating(true)
    try {
      const fieldStr = selectedTemplate.fields
        .map(f => `${f.label}：${formData[f.key] || '（未填写）'}`)
        .join('\n')

      const prompt = `${selectedTemplate.prompt}\n${fieldStr}\n\n请生成完整规范的法律文书，格式清晰，符合法律规范。`

      const { data, error } = await callEdgeFunction<{ content?: string }>('legal-chat', {
        body: { messages: [{ role: 'user', content: prompt }], mode: 'document' },
      })

      if (error) {
        console.error('文书生成错误:', error.message)
        Taro.showToast({ title: '生成失败，请稍后重试', icon: 'none' })
        return
      }
      const doc = data?.content || ''
      // 将结果存入 storage，再跳转到结果页
      Taro.setStorageSync('document_result', doc)
      Taro.setStorageSync('document_template_name', selectedTemplate.name)
      // redirectTo 替换当前表单页，跳转到结果页
      Taro.redirectTo({ url: `/pages/document/index?step=result&templateId=${selectedTemplate.id}` })
    } catch {
      Taro.showToast({ title: '网络异常，请稍后重试', icon: 'none' })
    } finally {
      setGenerating(false)
    }
  }, [selectedTemplate, formData])

  const handleSimulateDispute = useCallback(async () => {
    if (!generatedDoc) return
    const templateName = Taro.getStorageSync('document_template_name') || '法律文书'
    setLoadingDispute(true)
    setShowDispute(true)
    try {
      const prompt = `我已发出以下《${templateName}》：\n\n${generatedDoc.substring(0, 500)}\n\n请模拟对方（房东/雇主/中介）可能的狡辩，并教我如何拆招。`
      const { data, error } = await callEdgeFunction<{ content?: string }>('legal-chat', {
        body: { messages: [{ role: 'user', content: prompt }], mode: 'dispute' },
      })
      if (error) {
        Taro.showToast({ title: '模拟失败，请重试', icon: 'none' })
        setShowDispute(false)
        return
      }
      setDisputeContent(data?.content || '')
    } catch {
      Taro.showToast({ title: '网络异常，请稍后重试', icon: 'none' })
      setShowDispute(false)
    } finally {
      setLoadingDispute(false)
    }
  }, [generatedDoc])

  const copyDoc = () => {
    Taro.setClipboardData({
      data: generatedDoc,
      success: () => Taro.showToast({ title: '已复制到剪贴板', icon: 'success' }),
    })
  }

  const goBackToList = () => {
    // 清除缓存并返回模版列表
    Taro.removeStorageSync('document_result')
    Taro.removeStorageSync('document_template_name')
    Taro.navigateBack({ delta: 99 })
  }

  const disputeParsed = disputeContent ? parseDisputeReply(disputeContent) : null

  // 结果页面
  if (currentStep === 'result') {
    const templateName = Taro.getStorageSync('document_template_name') || '法律文书'
    return (
      <div className="min-h-screen bg-background">
        <div className="px-4 py-4">
          <div className="bg-card rounded-2xl border border-border p-4 mb-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xl font-semibold text-foreground">生成结果</p>
              <span className="text-xl px-2 py-1 bg-secondary text-primary rounded">{templateName}</span>
            </div>
            <div className="border border-border rounded-xl p-4 bg-background">
              <p className="text-xl text-foreground leading-loose whitespace-pre-wrap">{generatedDoc}</p>
            </div>
          </div>

          {!showDispute && (
            <button
              type="button"
              className="flex items-center justify-center leading-none gap-2 border border-primary bg-background rounded-xl w-full mb-3"
              onClick={handleSimulateDispute}
            >
              <div className="py-4 flex items-center gap-2">
                <div className="i-mdi-shield-sword-outline text-2xl text-primary" />
                <span className="text-xl text-primary">学长模拟：对方会怎么狡辩？</span>
              </div>
            </button>
          )}

          {showDispute && (
            <div className="bg-card rounded-2xl border border-border mb-4 overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
                <div className="i-mdi-sword-cross text-xl text-primary" />
                <p className="text-xl font-semibold text-foreground">见招拆招</p>
              </div>
              {loadingDispute ? (
                <div className="p-4 flex flex-col gap-2">
                  <div className="skeleton h-4 rounded" />
                  <div className="skeleton h-4 rounded w-5/6" />
                  <div className="skeleton h-4 rounded w-4/6" />
                </div>
              ) : disputeParsed && (
                <div className="p-4 flex flex-col gap-4">
                  <div>
                    <p className="text-xl font-medium text-destructive mb-2">对方可能的狡辩</p>
                    <p className="text-xl text-foreground leading-relaxed whitespace-pre-wrap">{disputeParsed.args}</p>
                  </div>
                  {disputeParsed.counter && (
                    <div>
                      <p className="text-xl font-medium text-primary mb-2">学长教你怎么拆招</p>
                      <div className="law-quote">
                        <p className="text-xl text-foreground leading-relaxed whitespace-pre-wrap">{disputeParsed.counter}</p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="flex flex-col gap-3">
            <button
              type="button"
              className="flex items-center justify-center leading-none gap-2 bg-primary rounded-xl"
              onClick={copyDoc}
            >
              <div className="py-4 flex items-center gap-2">
                <div className="i-mdi-content-copy text-2xl text-primary-foreground" />
                <span className="text-xl text-primary-foreground">复制文书内容</span>
              </div>
            </button>
            <button
              type="button"
              className="flex items-center justify-center leading-none gap-2 border border-border bg-background rounded-xl"
              onClick={goBackToList}
            >
              <div className="py-4 flex items-center gap-2">
                <div className="i-mdi-refresh text-2xl text-foreground" />
                <span className="text-xl text-foreground">重新选择模板</span>
              </div>
            </button>
          </div>
          <div className="mt-4 flex items-start gap-2 px-4 py-3 bg-muted rounded-xl">
            <div className="i-mdi-information-outline text-xl text-muted-foreground flex-shrink-0 mt-0.5" />
            <p className="text-xl text-muted-foreground leading-relaxed">本回复由AI生成，仅供参考，不构成正式法律建议。若情况紧急请咨询专业律师。</p>
          </div>
        </div>
      </div>
    )
  }

  // 表单填写页面
  if (currentStep === 'form' && selectedTemplate) {
    return (
      <div className="min-h-screen bg-background">
        <div className="px-4 py-4">
          <div className="bg-card rounded-2xl border border-border p-4 mb-4">
            <div className="flex items-center gap-3 mb-4">
              <div className={`${selectedTemplate.icon} text-3xl text-primary`} />
              <div>
                <p className="text-xl font-semibold text-foreground">{selectedTemplate.name}</p>
                <p className="text-xl text-muted-foreground">{selectedTemplate.desc}</p>
              </div>
            </div>
            <div className="flex flex-col gap-4">
              {selectedTemplate.fields.map((field) => (
                <div key={field.key}>
                  <div className="flex items-center gap-1 mb-2">
                    <span className="text-xl text-foreground">{field.label}</span>
                    {field.required && <span className="text-xl text-destructive">*</span>}
                  </div>
                  <div className="border border-input rounded-lg px-4 py-3 bg-background overflow-hidden">
                    <input
                      className="w-full text-xl text-foreground bg-transparent outline-none"
                      placeholder={field.placeholder}
                      value={formData[field.key] || ''}
                      onInput={(e) => { const ev = e as any; setField(field.key, ev.detail?.value ?? ev.target?.value ?? '') }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-3">
            <button
              type="button"
              className="flex items-center justify-center leading-none bg-primary rounded-xl"
              style={{ opacity: generating ? 0.5 : 1 }}
              onClick={handleGenerate}
            >
              <div className="py-4 flex items-center gap-2">
                {generating ? (
                  <div className="i-mdi-loading text-2xl text-primary-foreground animate-spin" />
                ) : (
                  <div className="i-mdi-file-document-edit-outline text-2xl text-primary-foreground" />
                )}
                <span className="text-xl text-primary-foreground">{generating ? '生成中...' : '生成文书'}</span>
              </div>
            </button>
            <button
              type="button"
              className="flex items-center justify-center leading-none border border-border bg-background rounded-xl"
              onClick={() => Taro.navigateBack()}
            >
              <div className="py-3 flex items-center gap-2">
                <div className="i-mdi-arrow-left text-2xl text-foreground" />
                <span className="text-xl text-foreground">返回选择模板</span>
              </div>
            </button>
          </div>
        </div>
      </div>
    )
  }

  // 模板选择页面（默认）
  return (
    <div className="min-h-screen bg-background">
      <div className="px-4 py-4">
        <p className="text-xl text-muted-foreground mb-4">选择需要生成的文书类型</p>
        <div className="flex flex-col gap-3">
          {TEMPLATES.map((template) => (
            <div
              key={template.id}
              className="bg-card rounded-2xl border border-border p-4 flex items-center gap-4 transition-all active:scale-95"
              onClick={() => Taro.navigateTo({ url: `/pages/document/index?step=form&templateId=${template.id}` })}
            >
              <div className={`${template.icon} text-3xl text-primary flex-shrink-0`} />
              <div className="flex-1">
                <p className="text-xl font-semibold text-foreground">{template.name}</p>
                <p className="text-xl text-muted-foreground mt-1">{template.desc}</p>
              </div>
              <div className="i-mdi-chevron-right text-2xl text-muted-foreground" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
