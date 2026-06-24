/** 法律计算器纯函数 — 所有计算公式集中管理，方便单独测试 */

export function calcSickWage(params: {
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
  return { result: dailyWage * sickDays * ratio, detail: '' }
}

export function calcPenalty(params: {
  monthlyRent: number; remainMonths: number; penaltyType: 'fixed' | 'ratio'; penaltyValue: number
}): { result: number } {
  const { monthlyRent, remainMonths, penaltyType, penaltyValue } = params
  if (!monthlyRent || !remainMonths) return { result: 0 }
  if (penaltyType === 'fixed') return { result: penaltyValue }
  return { result: monthlyRent * penaltyValue }
}

export function calcOvertime(params: {
  monthlySalary: number; workingDays: number; weekDayHours: number; restDayHours: number; holidayHours: number
}): { result: number } {
  const { monthlySalary, workingDays, weekDayHours, restDayHours, holidayHours } = params
  if (!monthlySalary || !workingDays) return { result: 0 }
  const hourlyWage = monthlySalary / workingDays / 8
  return { result: hourlyWage * weekDayHours * 1.5 + hourlyWage * restDayHours * 2.0 + hourlyWage * holidayHours * 3.0 }
}

export function calcSeverance(params: {
  monthlySalary: number; workYears: number; localAvgSalary: number; reason: 'n' | 'n1' | '2n'
}): { result: number } {
  const { monthlySalary, workYears, localAvgSalary, reason } = params
  if (!monthlySalary || workYears <= 0) return { result: 0 }
  const cap = localAvgSalary > 0 ? localAvgSalary * 3 : Infinity
  const base = Math.min(monthlySalary, cap)
  const n = Math.max(0.5, Math.ceil(workYears * 2) / 2)
  if (reason === 'n') return { result: base * n }
  if (reason === 'n1') return { result: base * n + base }
  return { result: base * n * 2 }
}

export function calcProbation(params: {
  contractSalary: number; probationMonths: number; localMinWage: number
}): { minProbationWage: number } {
  const { contractSalary, probationMonths, localMinWage } = params
  if (!contractSalary || !probationMonths) return { minProbationWage: 0 }
  return { minProbationWage: Math.max(contractSalary * 0.8, localMinWage || 0) }
}
