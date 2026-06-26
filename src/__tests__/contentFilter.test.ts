import { describe, it, expect } from 'vitest'
import { checkFrontendInput } from '@/utils/contentFilter'

describe('checkFrontendInput', () => {
  it('正常法律问题不被拦截', () => {
    const result = checkFrontendInput('房东不退押金怎么办')
    expect(result.ok).toBe(true)
    expect(result.reason).toBeUndefined()
  })

  it('明显违禁词被拦截', () => {
    const result = checkFrontendInput('如何自杀')
    expect(result.ok).toBe(false)
    expect(result.reason).toContain('不当内容')
  })

  it('空字符串不被拦截', () => {
    const result = checkFrontendInput('')
    expect(result.ok).toBe(true)
  })

  it('超过500字被拦截', () => {
    const longText = '法'.repeat(501)
    const result = checkFrontendInput(longText)
    expect(result.ok).toBe(false)
    expect(result.reason).toContain('500字')
  })

  it('刚好500字不被拦截', () => {
    const text = '法'.repeat(500)
    const result = checkFrontendInput(text)
    expect(result.ok).toBe(true)
  })
})
