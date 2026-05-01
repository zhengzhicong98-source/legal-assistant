import { useState, useMemo } from 'react'
import Taro from '@tarojs/taro'

type CalcType = 'sick' | 'penalty'

// 病假工资计算
function calcSickWage(params: {
  baseSalary: number
  sickDays: number
  workingDays: number
  workYears: number
}): { result: number; detail: string } {
  const { baseSalary, sickDays, workingDays, workYears } = params
  if (!baseSalary || !sickDays || !workingDays) return { result: 0, detail: '' }

  // 病假工资系数（按工龄）
  let ratio = 0.6
  if (workYears >= 20) ratio = 1.0
  else if (workYears >= 10) ratio = 0.9
  else if (workYears >= 5) ratio = 0.8
  else if (workYears >= 2) ratio = 0.7

  const dailyWage = baseSalary / workingDays
  const sickWage = dailyWage * sickDays * ratio

  const detail = `日薪 = ${baseSalary} ÷ ${workingDays} = ${dailyWage.toFixed(2)} 元\n病假工资系数 = ${(ratio * 100).toFixed(0)}%（工龄${workYears}年）\n病假工资 = ${dailyWage.toFixed(2)} × ${sickDays} × ${(ratio * 100).toFixed(0)}% = ${sickWage.toFixed(2)} 元`

  return { result: sickWage, detail }
}

// 违约金计算
function calcPenalty(params: {
  monthlyRent: number
  contractMonths: number
  remainMonths: number
  penaltyType: 'fixed' | 'ratio'
  penaltyValue: number
}): { result: number; detail: string } {
  const { monthlyRent, contractMonths, remainMonths, penaltyType, penaltyValue } = params
  if (!monthlyRent || !remainMonths) return { result: 0, detail: '' }

  let penalty = 0
  let detail = ''

  if (penaltyType === 'fixed') {
    penalty = penaltyValue
    detail = `固定违约金：${penaltyValue} 元`
  } else {
    // 按月租金比例
    penalty = monthlyRent * penaltyValue
    detail = `违约金 = ${monthlyRent} × ${penaltyValue} 月 = ${penalty.toFixed(2)} 元`
  }

  const legalMaxPenalty = monthlyRent * remainMonths * 0.3
  detail += `\n\n法律提示：违约金通常不超过剩余租金的30%（约${legalMaxPenalty.toFixed(0)}元），超出部分可申请法院调减。`

  if (contractMonths > 0 && remainMonths > contractMonths) {
    detail += '\n注意：剩余月数超过合同总月数，请检查输入。'
  }

  return { result: penalty, detail }
}

export default function Calculator() {
  const routerParams = useMemo(() => {
    const instance = Taro.getCurrentInstance()
    return instance?.router?.params || {}
  }, [])

  const defaultType: CalcType = (routerParams.type as CalcType) === 'penalty' ? 'penalty' : 'sick'
  const [activeTab, setActiveTab] = useState<CalcType>(defaultType)

  // 病假工资
  const [baseSalary, setBaseSalary] = useState('')
  const [sickDays, setSickDays] = useState('')
  const [workingDays, setWorkingDays] = useState('21.75')
  const [workYears, setWorkYears] = useState('')

  // 违约金
  const [monthlyRent, setMonthlyRent] = useState('')
  const [contractMonths, setContractMonths] = useState('')
  const [remainMonths, setRemainMonths] = useState('')
  const [penaltyType, setPenaltyType] = useState<'fixed' | 'ratio'>('ratio')
  const [penaltyValue, setPenaltyValue] = useState('')

  const sickResult = useMemo(() => {
    const b = parseFloat(baseSalary)
    const s = parseFloat(sickDays)
    const w = parseFloat(workingDays)
    const y = parseFloat(workYears)
    if (!b || !s || !w) return null
    return calcSickWage({ baseSalary: b, sickDays: s, workingDays: w, workYears: y || 0 })
  }, [baseSalary, sickDays, workingDays, workYears])

  const penaltyResult = useMemo(() => {
    const m = parseFloat(monthlyRent)
    const r = parseFloat(remainMonths)
    const c = parseFloat(contractMonths)
    const v = parseFloat(penaltyValue)
    if (!m || !r || !v) return null
    return calcPenalty({ monthlyRent: m, contractMonths: c || 0, remainMonths: r, penaltyType, penaltyValue: v })
  }, [monthlyRent, contractMonths, remainMonths, penaltyType, penaltyValue])

  const tabs: { key: CalcType; label: string; icon: string }[] = [
    { key: 'sick', label: '病假工资', icon: 'i-mdi-stethoscope' },
    { key: 'penalty', label: '违约金', icon: 'i-mdi-home-alert-outline' },
  ]

  return (
    <div className="min-h-screen bg-background">
      {/* 标签切换 */}
      <div className="flex bg-card border-b border-border px-4 gap-4">
        {tabs.map(tab => (
          <div
            key={tab.key}
            className={`flex items-center gap-2 py-4 border-b-2 transition-all ${activeTab === tab.key ? 'border-primary' : 'border-transparent'}`}
            onClick={() => setActiveTab(tab.key)}
          >
            <div className={`${tab.icon} text-2xl ${activeTab === tab.key ? 'text-primary' : 'text-muted-foreground'}`} />
            <span className={`text-xl font-medium ${activeTab === tab.key ? 'text-primary' : 'text-muted-foreground'}`}>{tab.label}</span>
          </div>
        ))}
      </div>

      <div className="px-4 py-4">
        {/* 病假工资计算器 */}
        {activeTab === 'sick' && (
          <div>
            <div className="bg-card rounded-2xl border border-border p-4 mb-4">
              <p className="text-xl font-semibold text-foreground mb-4">病假工资计算</p>
              <div className="flex flex-col gap-4">
                {[
                  { label: '月基本工资（元）', value: baseSalary, setter: setBaseSalary, placeholder: '请输入月基本工资', required: true },
                  { label: '病假天数（天）', value: sickDays, setter: setSickDays, placeholder: '请输入病假天数', required: true },
                  { label: '月计薪天数（天）', value: workingDays, setter: setWorkingDays, placeholder: '一般为21.75天', required: true },
                  { label: '工作年限（年）', value: workYears, setter: setWorkYears, placeholder: '影响病假工资比例', required: false },
                ].map(({ label, value, setter, placeholder, required }) => (
                  <div key={label}>
                    <div className="flex items-center gap-1 mb-2">
                      <span className="text-xl text-foreground">{label}</span>
                      {required && <span className="text-xl text-destructive">*</span>}
                    </div>
                    <div className="border border-input rounded-lg px-4 py-3 bg-background overflow-hidden">
                      <input
                        type="digit"
                        className="w-full text-xl text-foreground bg-transparent outline-none"
                        placeholder={placeholder}
                        value={value}
                        onInput={(e) => { const ev = e as any; setter(ev.detail?.value ?? ev.target?.value ?? '') }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 工龄参照表 */}
            <div className="bg-secondary rounded-2xl p-4 mb-4">
              <p className="text-xl font-medium text-foreground mb-3">病假工资系数参照（上海标准）</p>
              {[
                ['工龄不满2年', '60%'],
                ['工龄满2年不满5年', '70%'],
                ['工龄满5年不满10年', '80%'],
                ['工龄满10年不满20年', '90%'],
                ['工龄满20年及以上', '100%'],
              ].map(([years, ratio]) => (
                <div key={years} className="flex justify-between items-center py-2 border-b border-border last:border-0">
                  <span className="text-xl text-foreground">{years}</span>
                  <span className="text-xl font-medium text-primary">{ratio}</span>
                </div>
              ))}
            </div>

            {sickResult && sickResult.result > 0 && (
              <div className="bg-card rounded-2xl border border-primary p-4">
                <p className="text-xl font-semibold text-foreground mb-2">计算结果</p>
                <div className="flex items-baseline gap-2 mb-3">
                  <span className="text-3xl font-bold text-primary">{sickResult.result.toFixed(2)}</span>
                  <span className="text-xl text-muted-foreground">元</span>
                </div>
                <div className="law-quote">
                  <p className="text-xl text-foreground leading-relaxed whitespace-pre-line">{sickResult.detail}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 违约金计算器 */}
        {activeTab === 'penalty' && (
          <div>
            <div className="bg-card rounded-2xl border border-border p-4 mb-4">
              <p className="text-xl font-semibold text-foreground mb-4">租房违约金计算</p>
              <div className="flex flex-col gap-4">
                {[
                  { label: '月租金（元）', value: monthlyRent, setter: setMonthlyRent, placeholder: '请输入月租金金额', required: true },
                  { label: '合同租期（月）', value: contractMonths, setter: setContractMonths, placeholder: '如：12', required: false },
                  { label: '剩余租期（月）', value: remainMonths, setter: setRemainMonths, placeholder: '提前退租的剩余月数', required: true },
                ].map(({ label, value, setter, placeholder, required }) => (
                  <div key={label}>
                    <div className="flex items-center gap-1 mb-2">
                      <span className="text-xl text-foreground">{label}</span>
                      {required && <span className="text-xl text-destructive">*</span>}
                    </div>
                    <div className="border border-input rounded-lg px-4 py-3 bg-background overflow-hidden">
                      <input
                        type="digit"
                        className="w-full text-xl text-foreground bg-transparent outline-none"
                        placeholder={placeholder}
                        value={value}
                        onInput={(e) => { const ev = e as any; setter(ev.detail?.value ?? ev.target?.value ?? '') }}
                      />
                    </div>
                  </div>
                ))}

                <div>
                  <p className="text-xl text-foreground mb-2">违约金计算方式</p>
                  <div className="flex gap-3">
                    {[
                      { type: 'ratio' as const, label: '按月租金倍数' },
                      { type: 'fixed' as const, label: '固定金额' },
                    ].map(opt => (
                      <div
                        key={opt.type}
                        className={`flex-1 py-3 rounded-xl border text-center text-xl transition-all ${penaltyType === opt.type ? 'border-primary bg-secondary text-primary' : 'border-border bg-background text-foreground'}`}
                        onClick={() => setPenaltyType(opt.type)}
                      >
                        {opt.label}
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-xl text-foreground mb-2">
                    {penaltyType === 'ratio' ? '违约金倍数（月）' : '固定违约金（元）'}
                    <span className="text-destructive"> *</span>
                  </p>
                  <div className="border border-input rounded-lg px-4 py-3 bg-background overflow-hidden">
                    <input
                      type="digit"
                      className="w-full text-xl text-foreground bg-transparent outline-none"
                      placeholder={penaltyType === 'ratio' ? '如：2（表示2个月租金）' : '请输入固定违约金金额'}
                      value={penaltyValue}
                      onInput={(e) => { const ev = e as any; setPenaltyValue(ev.detail?.value ?? ev.target?.value ?? '') }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {penaltyResult && penaltyResult.result > 0 && (
              <div className="bg-card rounded-2xl border border-primary p-4">
                <p className="text-xl font-semibold text-foreground mb-2">计算结果</p>
                <div className="flex items-baseline gap-2 mb-3">
                  <span className="text-3xl font-bold text-primary">{penaltyResult.result.toFixed(2)}</span>
                  <span className="text-xl text-muted-foreground">元</span>
                </div>
                <div className="law-quote">
                  <p className="text-xl text-foreground leading-relaxed whitespace-pre-line">{penaltyResult.detail}</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
