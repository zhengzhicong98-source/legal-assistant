import { describe, it, expect } from 'vitest'
import { calcSickWage, calcPenalty, calcOvertime, calcSeverance, calcProbation } from '../calculators'

describe('calcSickWage', () => {
  it('calculates basic sick wage', () => {
    const result = calcSickWage({ baseSalary: 5000, sickDays: 5, workingDays: 21.75, workYears: 1 })
    expect(result.result).toBeGreaterThan(0)
    expect(result.result).toBeCloseTo(689.66, 0) // 5000/21.75*5*0.6
  })

  it('uses higher ratio for more work years', () => {
    const low = calcSickWage({ baseSalary: 5000, sickDays: 5, workingDays: 21.75, workYears: 2 })
    const high = calcSickWage({ baseSalary: 5000, sickDays: 5, workingDays: 21.75, workYears: 20 })
    expect(high.result).toBeGreaterThan(low.result)
  })

  it('returns 0 for invalid input', () => {
    expect(calcSickWage({ baseSalary: 0, sickDays: 5, workingDays: 21.75, workYears: 1 }).result).toBe(0)
    expect(calcSickWage({ baseSalary: 5000, sickDays: 0, workingDays: 21.75, workYears: 1 }).result).toBe(0)
  })
})

describe('calcOvertime', () => {
  it('calculates overtime with all types', () => {
    const result = calcOvertime({ monthlySalary: 8000, workingDays: 21.75, weekDayHours: 10, restDayHours: 8, holidayHours: 0 })
    expect(result.result).toBeGreaterThan(0)
    // hourly = 8000/21.75/8 = 45.98, 10*1.5*45.98 + 8*2*45.98 = 689.7 + 735.68 = 1425.38
  })

  it('returns 0 for no hours', () => {
    const result = calcOvertime({ monthlySalary: 8000, workingDays: 21.75, weekDayHours: 0, restDayHours: 0, holidayHours: 0 })
    expect(result.result).toBe(0)
  })
})

describe('calcSeverance', () => {
  it('N for 3 years', () => {
    const result = calcSeverance({ monthlySalary: 10000, workYears: 3, localAvgSalary: 0, reason: 'n' })
    expect(result.result).toBe(30000)
  })

  it('N+1 for 3 years', () => {
    const result = calcSeverance({ monthlySalary: 10000, workYears: 3, localAvgSalary: 0, reason: 'n1' })
    expect(result.result).toBe(40000)
  })

  it('2N for illegal termination', () => {
    const result = calcSeverance({ monthlySalary: 10000, workYears: 3, localAvgSalary: 0, reason: '2n' })
    expect(result.result).toBe(60000)
  })

  it('caps at 3x local average', () => {
    const result = calcSeverance({ monthlySalary: 50000, workYears: 2, localAvgSalary: 10000, reason: 'n' })
    expect(result.result).toBe(60000) // capped at 30000 * 2
  })

  it('0.5 year rounds to 0.5N', () => {
    const result = calcSeverance({ monthlySalary: 10000, workYears: 0.4, localAvgSalary: 0, reason: 'n' })
    expect(result.result).toBe(5000)
  })
})

describe('calcProbation', () => {
  it('80% of contract salary', () => {
    const result = calcProbation({ contractSalary: 8000, probationMonths: 3, localMinWage: 0 })
    expect(result.minProbationWage).toBe(6400)
  })

  it('respects local minimum wage', () => {
    const result = calcProbation({ contractSalary: 3000, probationMonths: 3, localMinWage: 2500 })
    expect(result.minProbationWage).toBe(2500) // 3000*0.8=2400 < 2500
  })

  it('returns 0 for zero salary', () => {
    expect(calcProbation({ contractSalary: 0, probationMonths: 3, localMinWage: 0 }).minProbationWage).toBe(0)
  })
})
