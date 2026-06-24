/**
 * 解析 AI 回复的结构化内容。
 * AI 按固定分隔符输出六部分：结论与分析、法律依据、学长翻译官、话术模板、投诉渠道、信源引用、追问建议。
 * 纯函数，无副作用，可直接单测。
 */
export interface ParsedReply {
  main: string
  law: string
  translate: string
  speech: string
  channel: string
  citations: string[]
  suggestions: string[]
}

export function parseReply(content: string): ParsedReply {
  const lawMatch = content.match(/---法律依据---([\s\S]*?)(?=---|$)/)
  const translateMatch = content.match(/---学长翻译官---([\s\S]*?)(?=---|$)/)
  const speechMatch = content.match(/---话术模板---([\s\S]*?)(?=---|$)/)
  const channelMatch = content.match(/---投诉渠道---([\s\S]*?)(?=---|$)/)
  const citationMatch = content.match(/---信源引用---([\s\S]*?)(?=---|$)/)
  const suggestMatch = content.match(/---追问建议---([\s\S]*?)$/)

  const mainContent = content
    .split('---法律依据---')[0]
    .replace('[结论与分析]', '')
    .trim()

  const citationRaw = citationMatch ? citationMatch[1].trim() : ''
  const citations = citationRaw
    ? citationRaw.split('\n').map(s => s.trim()).filter(s => s.length > 0)
    : []

  const suggestions = suggestMatch
    ? suggestMatch[1].trim().split('\n').map(s => s.trim()).filter(s => s.length > 0 && s.length < 60)
    : []

  return {
    main: mainContent,
    law: lawMatch ? lawMatch[1].trim() : '',
    translate: translateMatch ? translateMatch[1].trim() : '',
    speech: speechMatch ? speechMatch[1].trim() : '',
    channel: channelMatch ? channelMatch[1].trim() : '',
    citations,
    suggestions: suggestions.slice(0, 3),
  }
}
