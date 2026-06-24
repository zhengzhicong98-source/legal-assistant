import { useState, useMemo } from 'react'
import Taro from '@tarojs/taro'

type CalcType = 'sick' | 'penalty' | 'overtime' | 'severance' | 'probation'

// ============ 病假工资 ============
function calcSickWage(params: {
  baseSalary: number; sickDays: number; workingDays: number; workYears: number
}): { result: number; detail: string } {
  const { baseSalary, sickDays, workingDays, workYears } = params
  if (!baseSalary || !sickDays || !workingDays) return { result: 0, detail: '' }
  let ratio = 0.6
  if (workYears >= 20) ratio = 1.0
  else if (workYears >= 10) ratio = 0.9
  else if (workYears >= 5) ratio = 0.8
  else if (workYears >= 2) ratio = 0.7
  const dailyWage = baseSalary / workingDays
  const sickWage = dailyWage * sickDays * ratio
  return { result: sickWage, detail: `日薪 = ${baseSalary} ÷ ${workingDays} = ${dailyWage.toFixed(2)} 元\n病假工资系数 = ${(ratio * 100).toFixed(0)}%（工龄${workYears}年）\n病假工资 = ${dailyWage.toFixed(2)} × ${sickDays} × ${(ratio * 100).toFixed(0)}% = ${sickWage.toFixed(2)} 元` }
}

// ============ 违约金 ============
function calcPenalty(params: {
  monthlyRent: number; contractMonths: number; remainMonths: number; penaltyType: 'fixed' | 'ratio'; penaltyValue: number
}): { result: number; detail: string } {
  const { monthlyRent, remainMonths, penaltyType, penaltyValue } = params
  if (!monthlyRent || !remainMonths) return { result: 0, detail: '' }
  let penalty = 0, detail = ''
  if (penaltyType === 'fixed') {
    penalty = penaltyValue
    detail = `固定违约金：${penaltyValue} 元`
  } else {
    penalty = monthlyRent * penaltyValue
    detail = `违约金 = ${monthlyRent} × ${penaltyValue} 月 = ${penalty.toFixed(2)} 元`
  }
  const legalMaxPenalty = monthlyRent * remainMonths * 0.3
  detail += `\n\n法律提示：违约金通常不超过剩余租金的30%（约${legalMaxPenalty.toFixed(0)}元），超出部分可申请法院调减。`
  return { result: penalty, detail }
}

// ============ 加班工资 ============
function calcOvertime(params: {
  monthlySalary: number; workingDays: number; weekDayHours: number; restDayHours: number; holidayHours: number
}): { result: number; detail: string } {
  const { monthlySalary, workingDays, weekDayHours, restDayHours, holidayHours } = params
  if (!monthlySalary || !workingDays) return { result: 0, detail: '' }
  const dailyWage = monthlySalary / workingDays
  const hourlyWage = dailyWage / 8
  const weekDayPay = hourlyWage * weekDayHours * 1.5
  const restDayPay = hourlyWage * restDayHours * 2.0
  const holidayPay = hourlyWage * holidayHours * 3.0
  const total = weekDayPay + restDayPay + holidayPay
  const detail = [
    `小时工资 = ${monthlySalary} ÷ ${workingDays} ÷ 8 = ${hourlyWage.toFixed(2)} 元/小时`,
    weekDayHours > 0 ? `工作日加班：${hourlyWage.toFixed(2)} × ${weekDayHours}h × 1.5 = ${weekDayPay.toFixed(2)} 元` : '',
    restDayHours > 0 ? `休息日加班：${hourlyWage.toFixed(2)} × ${restDayHours}h × 2.0 = ${restDayPay.toFixed(2)} 元` : '',
    holidayHours > 0 ? `法定假日加班：${hourlyWage.toFixed(2)} × ${holidayHours}h × 3.0 = ${holidayPay.toFixed(2)} 元` : '',
    `合计：${total.toFixed(2)} 元`,
  ].filter(Boolean).join('\n')
  return { result: total, detail }
}

// ============ 离职补偿金 ============
function calcSeverance(params: {
  monthlySalary: number; workYears: number; localAvgSalary: number; reason: 'n' | 'n1' | '2n'
}): { result: number; detail: string } {
  const { monthlySalary, workYears, localAvgSalary, reason } = params
  if (!monthlySalary || workYears <= 0) return { result: 0, detail: '' }
  // 上限：当地月平均工资3倍
  const cap = localAvgSalary > 0 ? localAvgSalary * 3 : Infinity
  const base = Math.min(monthlySalary, cap)
  // N = 工作年限（不足半年按0.5，半年以上按1）
  const n = Math.max(0.5, Math.ceil(workYears * 2) / 2)
  const capped = base < monthlySalary ? `（月薪超过当地职工月平均工资 3 倍 = ${cap.toFixed(0)} 元，按 ${base.toFixed(0)} 元计算）` : ''
  let result = 0, formula = ''
  if (reason === 'n') {
    result = base * n
    formula = `${base.toFixed(0)} × ${n} = ${result.toFixed(2)} 元（N）`
  } else if (reason === 'n1') {
    result = base * n + base
    formula = `${base.toFixed(0)} × ${n} + ${base.toFixed(0)}（代通知金）= ${result.toFixed(2)} 元（N+1）`
  } else {
    result = base * n * 2
    formula = `${base.toFixed(0)} × ${n} × 2 = ${result.toFixed(2)} 元（2N，违法解除）`
  }
  return { result, detail: `${formula}\n${capped}\n\n适用情形：\n• N：协商一致解除、合同到期不续签、经济性裁员\n• N+1：无过失性解除且未提前30天通知（医疗期满、不胜任、客观情况变化）\n• 2N：用人单位违法解除劳动合同` }
}

// ============ 试用期工资 ============
function calcProbation(params: {
  contractSalary: number; probationMonths: number; totalMonths: number; localMinWage: number
}): { result: { minProbationWage: number; monthly: number; total: number }; detail: string } {
  const { contractSalary, probationMonths, totalMonths } = params
  if (!contractSalary || !probationMonths) return { result: { minProbationWage: 0, monthly: 0, total: 0 }, detail: '' }
  // 试用期工资 ≥ 转正工资80%，且 ≥ 当地最低工资
  const minByContract = contractSalary * 0.8
  const minProbationWage = Math.max(minByContract, params.localMinWage || 0)
  // 试用期上限
  let maxMonths = 6
  if (totalMonths > 0 && totalMonths < 3) maxMonths = 1
  else if (totalMonths >= 3 && totalMonths < 12) maxMonths = 1
  else if (totalMonths >= 12 && totalMonths < 36) maxMonths = 2
  const monthsWarning = probationMonths > maxMonths ? `\n注意：合同期${totalMonths}个月，法定试用期上限为${maxMonths}个月，当前${probationMonths}个月可能违法。` : ''
  return {
    result: { minProbationWage, monthly: minProbationWage, total: minProbationWage * probationMonths },
    detail: `转正工资：${contractSalary.toFixed(0)} 元/月\n试用期不低于转正80%：${minByContract.toFixed(0)} 元/月\n当地最低工资：${params.localMinWage || 0} 元/月\n试用期工资下限：${minProbationWage.toFixed(0)} 元/月\n试用期 ${probationMonths} 个月 × ${minProbationWage.toFixed(0)} = ${(minProbationWage * probationMonths).toFixed(0)} 元${monthsWarning}`
  }
}

const TABS: { key: CalcType; label: string; icon: string }[] = [
  { key: 'sick', label: '病假工资', icon: 'i-mdi-stethoscope' },
  { key: 'penalty', label: '违约金', icon: 'i-mdi-home-alert-outline' },
  { key: 'overtime', label: '加班工资', icon: 'i-mdi-clock-outline' },
  { key: 'severance', label: '离职补偿', icon: 'i-mdi-cash-multiple' },
  { key: 'probation', label: '试用期工资', icon: 'i-mdi-account-cash-outline' },
]

function InputField({ label, value, setter, placeholder, required }: { label: string; value: string; setter: (v: string) => void; placeholder: string; required?: boolean }) {
  return (
    <div>
      <div className="flex items-center gap-1 mb-2">
        <span className="text-xl text-foreground">{label}</span>
        {required && <span className="text-xl text-destructive">*</span>}
      </div>
      <div className="border border-input rounded-lg px-4 py-3 bg-background overflow-hidden">
        <input type="digit" className="w-full text-xl text-foreground bg-transparent outline-none"
          placeholder={placeholder} value={value}
          onInput={e => setter((e as any).detail?.value ?? (e as any).target?.value ?? '')} />
      </div>
    </div>
  )
}

export default function Calculator() {
  const routerParams = useMemo(() => {
    const instance = Taro.getCurrentInstance()
    return instance?.router?.params || {}
  }, [])
  const initType = (['sick', 'penalty', 'overtime', 'severance', 'probation'].includes(routerParams.type as string) ? routerParams.type : 'sick') as CalcType
  const [activeTab, setActiveTab] = useState<CalcType>(initType)

  // sick
  const [baseSalary, setBaseSalary] = useState('')
  const [sickDays, setSickDays] = useState('')
  const [workingDays, setWorkingDays] = useState('21.75')
  const [workYears, setWorkYears] = useState('')
  // penalty
  const [monthlyRent, setMonthlyRent] = useState('')
  const [contractMonths, setContractMonths] = useState('')
  const [remainMonths, setRemainMonths] = useState('')
  const [penaltyType, setPenaltyType] = useState<'fixed' | 'ratio'>('ratio')
  const [penaltyValue, setPenaltyValue] = useState('')
  // overtime
  const [monthlySalaryOt, setMonthlySalaryOt] = useState('')
  const [weekDayHours, setWeekDayHours] = useState('')
  const [restDayHours, setRestDayHours] = useState('')
  const [holidayHours, setHolidayHours] = useState('')
  // severance
  const [monthlySalarySv, setMonthlySalarySv] = useState('')
  const [svYears, setSvYears] = useState('')
  const [localAvgSalary, setLocalAvgSalary] = useState('')
  const [svReason, setSvReason] = useState<'n' | 'n1' | '2n'>('n')
  // probation
  const [contractSalaryPb, setContractSalaryPb] = useState('')
  const [probationMonths, setProbationMonths] = useState('')
  const [totalMonths, setTotalMonths] = useState('')
  const [localMinWage, setLocalMinWage] = useState('')

  const sickResult = useMemo(() => {
    const b = parseFloat(baseSalary), s = parseFloat(sickDays), w = parseFloat(workingDays), y = parseFloat(workYears)
    if (!b || !s || !w) return null
    return calcSickWage({ baseSalary: b, sickDays: s, workingDays: w, workYears: y || 0 })
  }, [baseSalary, sickDays, workingDays, workYears])

  const penaltyResult = useMemo(() => {
    const m = parseFloat(monthlyRent), r = parseFloat(remainMonths), c = parseFloat(contractMonths), v = parseFloat(penaltyValue)
    if (!m || !r || !v) return null
    return calcPenalty({ monthlyRent: m, contractMonths: c || 0, remainMonths: r, penaltyType, penaltyValue: v })
  }, [monthlyRent, contractMonths, remainMonths, penaltyType, penaltyValue])

  const overtimeResult = useMemo(() => {
    const ms = parseFloat(monthlySalaryOt), wd = parseFloat(workingDays)
    const wh = parseFloat(weekDayHours) || 0, rh = parseFloat(restDayHours) || 0, hh = parseFloat(holidayHours) || 0
    if (!ms || !wd) return null
    return calcOvertime({ monthlySalary: ms, workingDays: wd, weekDayHours: wh, restDayHours: rh, holidayHours: hh })
  }, [monthlySalaryOt, workingDays, weekDayHours, restDayHours, holidayHours])

  const severanceResult = useMemo(() => {
    const ms = parseFloat(monthlySalarySv), y = parseFloat(svYears), avg = parseFloat(localAvgSalary) || 0
    if (!ms || !y) return null
    return calcSeverance({ monthlySalary: ms, workYears: y, localAvgSalary: avg, reason: svReason })
  }, [monthlySalarySv, svYears, localAvgSalary, svReason])

  const probationResult = useMemo(() => {
    const cs = parseFloat(contractSalaryPb), pm = parseFloat(probationMonths), tm = parseFloat(totalMonths) || 0, mw = parseFloat(localMinWage) || 0
    if (!cs || !pm) return null
    return calcProbation({ contractSalary: cs, probationMonths: pm, totalMonths: tm, localMinWage: mw })
  }, [contractSalaryPb, probationMonths, totalMonths, localMinWage])

  return (
    <div className="min-h-screen bg-background pb-8">
      {/* 标签切换 */}
      <div className="flex bg-card border-b border-border px-2 gap-1 overflow-x-auto">
        {TABS.map(tab => (
          <div key={tab.key}
            className={`flex items-center gap-1 py-3 px-2 border-b-2 transition-all flex-shrink-0 ${activeTab === tab.key ? 'border-primary' : 'border-transparent'}`}
            onClick={() => setActiveTab(tab.key)}>
            <div className={`text-xl ${tab.icon} ${activeTab === tab.key ? 'text-primary' : 'text-muted-foreground'}`} />
            <span className={`text-base font-medium whitespace-nowrap ${activeTab === tab.key ? 'text-primary' : 'text-muted-foreground'}`}>{tab.label}</span>
          </div>
        ))}
      </div>

      <div className="px-4 py-4">
        {/* 病假工资 */}
        {activeTab === 'sick' && (
          <div>
            <div className="bg-card rounded-2xl border border-border p-4 mb-4">
              <p className="text-xl font-semibold text-foreground mb-4">病假工资计算</p>
              <div className="flex flex-col gap-4">
                <InputField label="月基本工资（元）" value={baseSalary} setter={setBaseSalary} placeholder="请输入月基本工资" required />
                <InputField label="病假天数（天）" value={sickDays} setter={setSickDays} placeholder="请输入病假天数" required />
                <InputField label="月计薪天数（天）" value={workingDays} setter={setWorkingDays} placeholder="一般为21.75天" required />
                <InputField label="工作年限（年）" value={workYears} setter={setWorkYears} placeholder="影响病假工资比例" />
              </div>
            </div>
            <div className="bg-secondary rounded-2xl p-4 mb-4">
              <p className="text-xl font-medium text-foreground mb-3">病假工资系数参照（上海标准）</p>
              {[['工龄不满2年', '60%'], ['工龄满2年不满5年', '70%'], ['工龄满5年不满10年', '80%'], ['工龄满10年不满20年', '90%'], ['工龄满20年及以上', '100%']].map(([years, ratio]) => (
                <div key={years} className="flex justify-between items-center py-2 border-b border-border last:border-0">
                  <span className="text-xl text-foreground">{years}</span>
                  <span className="text-xl font-medium text-primary">{ratio}</span>
                </div>
              ))}
            </div>
            {sickResult && sickResult.result > 0 && (
              <div className="bg-card rounded-2xl border border-primary p-4">
                <p className="text-xl font-semibold text-foreground mb-2">计算结果</p>
                <div className="flex items-baseline gap-2 mb-3"><span className="text-3xl font-bold text-primary">{sickResult.result.toFixed(2)}</span><span className="text-xl text-muted-foreground">元</span></div>
                <div className="law-quote"><p className="text-xl text-foreground leading-relaxed whitespace-pre-line">{sickResult.detail}</p></div>
              </div>
            )}
          </div>
        )}

        {/* 违约金 — 保持原逻辑 */}
        {activeTab === 'penalty' && (
          <div>
            <div className="bg-card rounded-2xl border border-border p-4 mb-4">
              <p className="text-xl font-semibold text-foreground mb-4">租房违约金计算</p>
              <div className="flex flex-col gap-4">
                <InputField label="月租金（元）" value={monthlyRent} setter={setMonthlyRent} placeholder="请输入月租金金额" required />
                <InputField label="合同租期（月）" value={contractMonths} setter={setContractMonths} placeholder="如：12" />
                <InputField label="剩余租期（月）" value={remainMonths} setter={setRemainMonths} placeholder="提前退租的剩余月数" required />
                <div>
                  <p className="text-xl text-foreground mb-2">违约金计算方式</p>
                  <div className="flex gap-3">
                    {[{ type: 'ratio' as const, label: '按月租金倍数' }, { type: 'fixed' as const, label: '固定金额' }].map(opt => (
                      <div key={opt.type} className={`flex-1 py-3 rounded-xl border text-center text-xl transition-all ${penaltyType === opt.type ? 'border-primary bg-secondary text-primary' : 'border-border bg-background text-foreground'}`}
                        onClick={() => setPenaltyType(opt.type)}>{opt.label}</div>
                    ))}
                  </div>
                </div>
                <InputField label={penaltyType === 'ratio' ? '违约金倍数（月）' : '固定违约金（元）'} value={penaltyValue} setter={setPenaltyValue} placeholder={penaltyType === 'ratio' ? '如：2（表示2个月租金）' : '请输入固定违约金金额'} required />
              </div>
            </div>
            {penaltyResult && penaltyResult.result > 0 && (
              <div className="bg-card rounded-2xl border border-primary p-4">
                <p className="text-xl font-semibold text-foreground mb-2">计算结果</p>
                <div className="flex items-baseline gap-2 mb-3"><span className="text-3xl font-bold text-primary">{penaltyResult.result.toFixed(2)}</span><span className="text-xl text-muted-foreground">元</span></div>
                <div className="law-quote"><p className="text-xl text-foreground leading-relaxed whitespace-pre-line">{penaltyResult.detail}</p></div>
              </div>
            )}
          </div>
        )}

        {/* 加班工资 */}
        {activeTab === 'overtime' && (
          <div>
            <div className="bg-card rounded-2xl border border-border p-4 mb-4">
              <p className="text-xl font-semibold text-foreground mb-4">加班工资计算</p>
              <p className="text-xl text-muted-foreground mb-4">根据《劳动法》第44条：工作日加班 1.5 倍、休息日 2 倍、法定假日 3 倍</p>
              <div className="flex flex-col gap-4">
                <InputField label="月工资（元）" value={monthlySalaryOt} setter={setMonthlySalaryOt} placeholder="请输入月工资" required />
                <InputField label="月计薪天数（天）" value={workingDays} setter={setWorkingDays} placeholder="一般为21.75天" required />
                <InputField label="工作日加班（小时）" value={weekDayHours} setter={setWeekDayHours} placeholder="超出8小时的部分 × 1.5" />
                <InputField label="休息日加班（小时）" value={restDayHours} setter={setRestDayHours} placeholder="周六日加班 × 2.0" />
                <InputField label="法定假日加班（小时）" value={holidayHours} setter={setHolidayHours} placeholder="元旦/春节/五一/国庆等 × 3.0" />
              </div>
            </div>
            {overtimeResult && overtimeResult.result > 0 && (
              <div className="bg-card rounded-2xl border border-primary p-4">
                <p className="text-xl font-semibold text-foreground mb-2">计算结果</p>
                <div className="flex items-baseline gap-2 mb-3"><span className="text-3xl font-bold text-primary">{overtimeResult.result.toFixed(2)}</span><span className="text-xl text-muted-foreground">元</span></div>
                <div className="law-quote"><p className="text-xl text-foreground leading-relaxed whitespace-pre-line">{overtimeResult.detail}</p></div>
              </div>
            )}
          </div>
        )}

        {/* 离职补偿金 */}
        {activeTab === 'severance' && (
          <div>
            <div className="bg-card rounded-2xl border border-border p-4 mb-4">
              <p className="text-xl font-semibold text-foreground mb-4">离职经济补偿金计算</p>
              <p className="text-xl text-muted-foreground mb-4">依据《劳动合同法》第47条：每满一年支付一个月工资（N）</p>
              <div className="flex flex-col gap-4">
                <InputField label="月工资（元）" value={monthlySalarySv} setter={setMonthlySalarySv} placeholder="离职前12个月平均工资" required />
                <InputField label="工作年限（年）" value={svYears} setter={setSvYears} placeholder="含试用期，不满半年按0.5年" required />
                <InputField label="当地月平均工资（元）" value={localAvgSalary} setter={setLocalAvgSalary} placeholder="非必填，超过3倍时按3倍封顶" />
                <div>
                  <p className="text-xl text-foreground mb-3">解除类型</p>
                  <div className="flex gap-2">
                    {[{ v: 'n' as const, l: 'N', d: '协商一致/裁员' }, { v: 'n1' as const, l: 'N+1', d: '无过失未提前通知' }, { v: '2n' as const, l: '2N', d: '违法解除' }].map(o => (
                      <div key={o.v} className={`flex-1 py-3 rounded-xl border text-center transition-all ${svReason === o.v ? 'border-primary bg-secondary text-primary' : 'border-border bg-background text-foreground'}`}
                        onClick={() => setSvReason(o.v)}>
                        <p className="text-xl font-bold">{o.l}</p><p className="text-base text-muted-foreground">{o.d}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            {severanceResult && severanceResult.result > 0 && (
              <div className="bg-card rounded-2xl border border-primary p-4">
                <p className="text-xl font-semibold text-foreground mb-2">计算结果</p>
                <div className="flex items-baseline gap-2 mb-3"><span className="text-3xl font-bold text-primary">{severanceResult.result.toFixed(2)}</span><span className="text-xl text-muted-foreground">元</span></div>
                <div className="law-quote"><p className="text-xl text-foreground leading-relaxed whitespace-pre-line">{severanceResult.detail}</p></div>
              </div>
            )}
          </div>
        )}

        {/* 试用期工资 */}
        {activeTab === 'probation' && (
          <div>
            <div className="bg-card rounded-2xl border border-border p-4 mb-4">
              <p className="text-xl font-semibold text-foreground mb-4">试用期工资计算</p>
              <p className="text-xl text-muted-foreground mb-4">依据《劳动合同法》第20条：试用期工资不得低于转正工资的80%，且不低于当地最低工资</p>
              <div className="flex flex-col gap-4">
                <InputField label="转正后月工资（元）" value={contractSalaryPb} setter={setContractSalaryPb} placeholder="合同约定的转正工资" required />
                <InputField label="试用期（月）" value={probationMonths} setter={setProbationMonths} placeholder="如：3" required />
                <InputField label="合同总期限（月）" value={totalMonths} setter={setTotalMonths} placeholder="如：36，用于判断试用期上限" />
                <InputField label="当地最低工资（元）" value={localMinWage} setter={setLocalMinWage} placeholder="非必填" />
              </div>
            </div>
            {probationResult && probationResult.result.minProbationWage > 0 && (
              <div className="bg-card rounded-2xl border border-primary p-4">
                <p className="text-xl font-semibold text-foreground mb-2">计算结果</p>
                <div className="flex items-baseline gap-2 mb-3"><span className="text-3xl font-bold text-primary">{probationResult.result.monthly.toFixed(0)}</span><span className="text-xl text-muted-foreground">元/月（下限）</span></div>
                <div className="law-quote"><p className="text-xl text-foreground leading-relaxed whitespace-pre-line">{probationResult.detail}</p></div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
