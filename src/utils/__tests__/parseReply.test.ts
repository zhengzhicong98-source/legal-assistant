import { describe, it, expect } from 'vitest'
import { parseReply } from '../parseReply'

const FULL_REPLY = `[结论与分析]
房东应在租期结束后15日内退还押金，无正当理由扣留属违约行为。

---法律依据---
《民法典》第703条：租赁合同是出租人将租赁物交付承租人使用、收益，承租人支付租金的合同。
《商品房屋租赁管理办法》第9条：出租人不得以任何形式收取超过3个月租金的押金。

---学长翻译官---
意思就是退房时只要房子没损坏，押金法律上本来就应该退给你。扣着不退属于房东违约。

---话术模板---
"房东您好，根据《民法典》第703条，租赁期满后您应在15日内退还押金。目前您扣留押金的行为已构成违约，请您在3日内退还，否则我将向住建部门投诉。"

---投诉渠道---
1. 12315消费者热线
2. 当地住建委租赁管理科
3. 社区人民调解委员会

---信源引用---
• 来源《民法典》第703条：租赁合同是出租人将租赁物交付承租人使用、收益，承租人支付租金的合同。
• 来源《商品房屋租赁管理办法》第9条：出租人不得以任何形式收取超过3个月租金的押金。

---追问建议---
押金被克扣了怎么维权？
租房押金要多久才能退？
可以去哪投诉房东不退押金？`

describe('parseReply', () => {
  it('parses full structured reply with all sections', () => {
    const result = parseReply(FULL_REPLY)
    expect(result.main).toContain('15日内退还押金')
    expect(result.law).toContain('民法典')
    expect(result.law).not.toContain('---')
    expect(result.translate).toContain('意思就是')
    expect(result.speech).toContain('房东您好')
    expect(result.channel).toContain('12315')
    expect(result.citations).toHaveLength(2)
    expect(result.citations[0]).toContain('•')
    expect(result.suggestions).toHaveLength(3)
  })

  it('extracts main content before first separator', () => {
    const result = parseReply(FULL_REPLY)
    expect(result.main).not.toContain('---')
    expect(result.main).toContain('15日内')
  })

  it('strips [结论与分析] label from main content', () => {
    const result = parseReply(FULL_REPLY)
    expect(result.main).not.toContain('[结论与分析]')
  })

  it('returns empty strings for missing optional sections', () => {
    const result = parseReply('Just a simple reply without sections.')
    expect(result.main).toBe('Just a simple reply without sections.')
    expect(result.law).toBe('')
    expect(result.translate).toBe('')
    expect(result.speech).toBe('')
    expect(result.channel).toBe('')
    expect(result.citations).toEqual([])
    expect(result.suggestions).toEqual([])
  })

  it('filters suggestions longer than 59 chars', () => {
    const longReply = `[结论与分析]\nok\n\n---追问建议---\nvalid question?\n${'x'.repeat(60)}\nshort?`
    const result = parseReply(longReply)
    expect(result.suggestions).toEqual(['valid question?', 'short?'])
  })

  it('limits suggestions to 3', () => {
    const multiSuggestion = `[结论与分析]\nok\n\n---追问建议---\nq1?\nq2?\nq3?\nq4?\nq5?`
    const result = parseReply(multiSuggestion)
    expect(result.suggestions).toHaveLength(3)
  })

  it('handles edge case: empty string input', () => {
    const result = parseReply('')
    expect(result.main).toBe('')
    expect(result.citations).toEqual([])
    expect(result.suggestions).toEqual([])
  })
})
