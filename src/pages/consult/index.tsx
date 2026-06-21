import { useState, useCallback, useRef, useEffect } from 'react'
import Taro, { useShareAppMessage, useShareTimeline } from '@tarojs/taro'
import { callEdgeFunction } from '@/utils/callEdgeFunction'
import { recordQuestion, saveConsultHistory, logAiCall, submitFeedback } from '@/db/api'
import { useAuth } from '@/contexts/AuthContext'
import type { ChatMessage } from '@/db/types'

const QUICK_QUESTIONS = [
  '房东不退押金怎么办？',
  '试用期被解雇有赔偿吗？',
  '租房合同提前解除怎么处理？',
  '公司不签劳动合同违法吗？',
]

// 解析AI回复的结构化内容
function parseReply(content: string) {
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

  // 解析信源引用：每行一条（以•开头），过滤空行
  const citationRaw = citationMatch ? citationMatch[1].trim() : ''
  const citations = citationRaw
    ? citationRaw.split('\n').map(s => s.trim()).filter(s => s.length > 0)
    : []

  // 解析追问建议：每行一个问题，过滤空行
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

const DISCLAIMER = '本回复由AI生成，仅供参考，不构成正式法律建议。若情况紧急请咨询专业律师。'

function MessageBubble({ msg, onSuggest, isLast, onFeedback, historyId }: { msg: ChatMessage; onSuggest?: (q: string) => void; isLast?: boolean; onFeedback?: (val: 1 | -1) => void; historyId?: string }) {
  const [expandedSection, setExpandedSection] = useState<string | null>(null)

  if (msg.role === 'user') {
    return (
      <div className="flex justify-end mb-4">
        <div className="max-w-xs px-4 py-3 bg-primary rounded-2xl rounded-tr-sm">
          <p className="text-xl text-primary-foreground leading-relaxed">{msg.content}</p>
        </div>
      </div>
    )
  }

  const parsed = parseReply(msg.content)
  const sections = [
    { key: 'law', label: '法律依据', icon: 'i-mdi-gavel', content: parsed.law },
    { key: 'speech', label: '话术模板', icon: 'i-mdi-message-text-outline', content: parsed.speech },
    { key: 'channel', label: '投诉渠道', icon: 'i-mdi-map-marker-outline', content: parsed.channel },
  ].filter(s => s.content)

  return (
    <div className="flex justify-start mb-4">
      <div className="flex items-start gap-2 max-w-sm">
        <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center flex-shrink-0 mt-1">
          <div className="i-mdi-scale-balance text-xl text-primary-foreground" />
        </div>
        <div className="flex flex-col gap-2">
          {/* RAG 命中提示 */}
          {msg.ragUsed && (
            <div className="flex items-center gap-1 px-3 py-1 bg-primary/10 rounded-full self-start">
              <div className="i-mdi-database-check-outline text-xl text-primary" />
              <span className="text-base text-primary font-medium">已参考知识库法条</span>
            </div>
          )}
          {/* 主回答 */}
          <div className="px-4 py-3 bg-card rounded-2xl rounded-tl-sm border border-border">
            <p className="text-xl text-foreground leading-relaxed">{parsed.main}</p>
          </div>
          {/* 学长翻译官（固定显示，不折叠） */}
          {parsed.translate && (
            <div className="flex items-start gap-2 px-3 py-3 bg-secondary rounded-xl">
              <div className="i-mdi-translate text-xl text-primary flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xl font-medium text-primary mb-1">学长翻译官</p>
                <p className="text-xl text-foreground leading-relaxed">{parsed.translate}</p>
              </div>
            </div>
          )}
          {/* 展开式信息块 */}
          {sections.map((section) => (
            <div key={section.key} className="bg-card rounded-xl border border-border overflow-hidden">
              <div
                className="flex items-center justify-between px-4 py-3"
                onClick={() => setExpandedSection(expandedSection === section.key ? null : section.key)}
              >
                <div className="flex items-center gap-2">
                  <div className={`${section.icon} text-xl text-primary`} />
                  <span className="text-xl font-medium text-foreground">{section.label}</span>
                </div>
                <div className={`i-mdi-chevron-down text-xl text-muted-foreground transition-transform ${expandedSection === section.key ? 'rotate-180' : ''}`} />
              </div>
              {expandedSection === section.key && (
                <div className="px-4 pb-3">
                  <div className="law-quote">
                    <p className="text-xl text-foreground leading-relaxed">{section.content}</p>
                  </div>
                </div>
              )}
            </div>
          ))}
          {/* 信源引用区块 */}
          {parsed.citations.length > 0 && (
            <div className="px-3 py-3 bg-muted rounded-xl border border-border">
              <div className="flex items-center gap-2 mb-2">
                <div className="i-mdi-bookshelf text-xl text-muted-foreground" />
                <span className="text-xl font-medium text-muted-foreground">信源引用</span>
              </div>
              <div className="flex flex-col gap-1">
                {parsed.citations.map((cite, i) => (
                  <div key={i} className="flex items-start gap-1">
                    <span className="text-xl text-muted-foreground leading-relaxed">{cite}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {/* 追问建议（仅最新一条AI回复显示） */}
          {isLast && parsed.suggestions.length > 0 && onSuggest && (
            <div className="bg-card rounded-xl border border-border p-3">
              <div className="flex items-center gap-2 mb-2">
                <div className="i-mdi-lightbulb-on-outline text-xl text-amber-500" />
                <span className="text-xl font-medium text-foreground">继续追问</span>
              </div>
              <div className="flex flex-col gap-2">
                {parsed.suggestions.map((q, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 px-3 py-2 bg-secondary rounded-xl transition-all active:scale-95"
                    onClick={() => onSuggest(q)}
                  >
                    <div className="i-mdi-arrow-right-circle-outline text-xl text-primary flex-shrink-0" />
                    <span className="text-xl text-foreground flex-1">{q}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {/* 反馈按钮 */}
          {msg.role === 'assistant' && onFeedback && (
            <div className="flex items-center gap-3 px-3 py-2">
              <span className="text-xl text-muted-foreground">这个回答有帮助吗？</span>
              <div
                className={`flex items-center gap-1 px-3 py-1 rounded-full border transition-all active:scale-95 ${
                  msg.feedback === 1
                    ? 'bg-primary border-primary text-primary-foreground'
                    : 'border-border text-muted-foreground'
                }`}
                onClick={() => onFeedback(1)}
              >
                <div className="i-mdi-thumb-up-outline text-xl" />
                <span className="text-xl">有用</span>
              </div>
              <div
                className={`flex items-center gap-1 px-3 py-1 rounded-full border transition-all active:scale-95 ${
                  msg.feedback === -1
                    ? 'bg-destructive border-destructive text-destructive-foreground'
                    : 'border-border text-muted-foreground'
                }`}
                onClick={() => onFeedback(-1)}
              >
                <div className="i-mdi-thumb-down-outline text-xl" />
                <span className="text-xl">没用</span>
              </div>
            </div>
          )}
          {/* 固定免责声明 */}
          <div className="flex items-start gap-1 px-3 py-2">
            <div className="i-mdi-information-outline text-xl text-muted-foreground flex-shrink-0 mt-0.5" />
            <p className="text-xl text-muted-foreground leading-relaxed">{DISCLAIMER}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Chat() {
  useShareAppMessage(() => ({
    title: '法律咨询 - 法律助手',
    path: '/pages/chat/index',
  }))
  useShareTimeline(() => ({ title: '法律咨询 - 法律助手' }))

  const { user } = useAuth()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  /** 搜索模式：普通咨询 | 联网搜索 */
  const [searchMode, setSearchMode] = useState<'chat' | 'search'>('chat')

  // 检查首页跳转过来的预填问题
  useEffect(() => {
    const prefill = Taro.getStorageSync('consult_prefill')
    if (prefill) {
      setInput(prefill)
      Taro.removeStorageSync('consult_prefill')
    }
  }, [])

  /** 普通咨询（调用 legal-chat） */
  const sendChatMessage = useCallback(async (text: string) => {
    if (!text.trim() || loading) return
    const userMsg: ChatMessage = { role: 'user', content: text.trim(), timestamp: Date.now() }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    setLoading(true)

    const apiMessages = newMessages.map(m => ({ role: m.role, content: m.content }))

    // H5 环境使用流式输出
    if (process.env.TARO_ENV === 'h5') {
      const supabaseUrl = process.env.TARO_APP_SUPABASE_URL
      const anonKey = process.env.TARO_APP_SUPABASE_ANON_KEY
      const url = `${supabaseUrl}/functions/v1/legal-chat`

      const startTime = Date.now()
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${anonKey}`,
            'apikey': anonKey || '',
          },
          body: JSON.stringify({ messages: apiMessages, mode: 'chat' }),
        })

        if (!response.ok || !response.body) {
          throw new Error('请求失败')
        }

        // 添加一条空的 assistant 消息占位，之后逐步追加内容
        const assistantMsg: ChatMessage = {
          role: 'assistant',
          content: '',
          timestamp: Date.now(),
          ragUsed: false,
        }
        setMessages([...newMessages, assistantMsg])
        setLoading(false)

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let fullContent = ''
        let ragUsed = false

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          const chunk = decoder.decode(value, { stream: true })
          const lines = chunk.split('\n')

          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed.startsWith('data:')) continue
            const jsonStr = trimmed.slice(5).trim()
            if (jsonStr === '[DONE]') break
            try {
              const data = JSON.parse(jsonStr)
              // 检查是否是末尾的 rag_used 元数据
              if ('rag_used' in data) {
                ragUsed = data.rag_used
                continue
              }
              const delta = data?.choices?.[0]?.delta?.content || ''
              if (delta) {
                fullContent += delta
                // 实时更新消息内容
                setMessages(prev => {
                  const updated = [...prev]
                  const last = updated[updated.length - 1]
                  updated[updated.length - 1] = {
                    ...last,
                    content: fullContent,
                    ragUsed,
                    // 保留已有的 historyId，不覆盖
                    historyId: last.historyId,
                  }
                  return updated
                })
              }
            } catch { /* 跳过无效 chunk */ }
          }
        }

        // 流结束后保存历史和日志
        const responseTimeMs = Date.now() - startTime
        if (user && fullContent) {
          try {
            const { id: historyId, error: saveError } = await saveConsultHistory(user.id, text.trim(), fullContent, ragUsed, responseTimeMs)
            console.log('[debug] saveConsultHistory result:', historyId, saveError)
            if (historyId) {
              setMessages(prev => {
                const updated = [...prev]
                updated[updated.length - 1] = {
                  ...updated[updated.length - 1],
                  historyId,
                }
                return updated
              })
            }
          } catch {}
          logAiCall({
            userId: user.id,
            functionName: 'legal-chat',
            model: 'glm-4-flash',
            promptLength: text.length,
            responseLength: fullContent.length,
            responseTimeMs,
            ragUsed,
            ragHitCount: ragUsed ? 1 : 0,
            success: true,
          }).catch(() => {})
        }

      } catch (err) {
        console.error('流式咨询错误:', err)
        Taro.showToast({ title: '咨询失败，请稍后重试', icon: 'none' })
        setMessages(newMessages)
        setLoading(false)
      }
      return
    }

    // 小程序环境保持原有非流式逻辑
    const startTime = Date.now()
    const { data, error } = await callEdgeFunction<{ content?: string; rag_used?: boolean }>('legal-chat', {
      body: { messages: apiMessages, mode: 'chat' },
    })

    if (error) {
      console.error('法律咨询错误:', error.message)
      Taro.showToast({ title: '咨询失败，请稍后重试', icon: 'none' })
      setMessages(newMessages)
    } else {
      const aiContent = data?.content || '抱歉，未获取到回复，请重试。'
      const ragUsed = !!data?.rag_used
      const responseTimeMs = Date.now() - startTime
      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: aiContent,
        timestamp: Date.now(),
        ragUsed,
      }
      setMessages([...newMessages, assistantMsg])
      if (user) {
        try {
          const { id: historyId } = await saveConsultHistory(user.id, text.trim(), aiContent, ragUsed, responseTimeMs)
          if (historyId) {
            setMessages(prev => {
              const updated = [...prev]
              updated[updated.length - 1] = {
                ...updated[updated.length - 1],
                historyId,
              }
              return updated
            })
          }
        } catch {}
        logAiCall({
          userId: user.id,
          functionName: 'legal-chat',
          model: 'glm-4-flash',
          promptLength: text.length,
          responseLength: aiContent.length,
          responseTimeMs,
          ragUsed,
          ragHitCount: ragUsed ? 1 : 0,
          success: true,
        }).catch(() => {})
      }
    }
    setLoading(false)
  }, [messages, loading, user])

  /** 联网搜索（调用百度AI搜索） */
  const sendSearchMessage = useCallback(async (text: string) => {
    if (!text.trim() || loading) return
    const userMsg: ChatMessage = { role: 'user', content: text.trim(), timestamp: Date.now() }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    setLoading(true)

    const { data, error } = await callEdgeFunction<{
      content?: string
      references?: { id: number; title: string; url: string; date?: string }[]
    }>('ai-search', {
      body: { query: text.trim() },
    })

    if (error) {
      Taro.showToast({ title: '搜索失败，请稍后重试', icon: 'none' })
      setMessages(newMessages)
    } else {
      // 将参考来源追加到回答末尾（标注）
      let content = data?.content || '未找到相关信息，请换个关键词试试。'
      const refs = data?.references || []
      if (refs.length > 0) {
        const refText = '\n\n---参考来源---\n' + refs
          .slice(0, 5)
          .map((r, i) => `[${i + 1}] ${r.title}${r.date ? `（${r.date}）` : ''}`)
          .join('\n')
        content += refText
      }
      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content,
        timestamp: Date.now(),
        ragUsed: false,
      }
      setMessages([...newMessages, assistantMsg])
    }
    setLoading(false)
  }, [messages, loading])

  const sendMessage = useCallback((text: string) => {
    const trimmed = text.trim()
    if (!trimmed) return
    // 异步记录问题统计（不阻塞发送）
    recordQuestion(trimmed).catch(() => {})
    if (searchMode === 'search') {
      return sendSearchMessage(trimmed)
    }
    return sendChatMessage(trimmed)
  }, [searchMode, sendChatMessage, sendSearchMessage])

  const handleFeedback = useCallback(async (historyId: string, feedback: 1 | -1) => {
    await submitFeedback(historyId, feedback)
    setMessages(prev => prev.map(m =>
      m.historyId === historyId ? { ...m, feedback } : m
    ))
    Taro.showToast({ title: feedback === 1 ? '感谢反馈！' : '已记录，我们会改进', icon: 'none' })
  }, [])

  const clearChat = () => {
    setMessages([])
    setInput('')
  }

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* 顶部：模式切换 + 新对话 */}
      <div className="flex items-center justify-between px-4 py-3 bg-card border-b border-border">
        {/* 模式切换 */}
        <div className="flex items-center gap-1 bg-muted rounded-xl p-1">
          {[
            { key: 'chat' as const, icon: 'i-mdi-scale-balance', label: '普通咨询' },
            { key: 'search' as const, icon: 'i-mdi-web', label: '联网搜索' },
          ].map(m => (
            <div
              key={m.key}
              className={`flex items-center gap-1 px-3 py-2 rounded-lg transition-all ${searchMode === m.key ? 'bg-card shadow-sm' : ''}`}
              onClick={() => setSearchMode(m.key)}
            >
              <div className={`${m.icon} text-xl ${searchMode === m.key ? 'text-primary' : 'text-muted-foreground'}`} />
              <span className={`text-xl font-medium ${searchMode === m.key ? 'text-primary' : 'text-muted-foreground'}`}>{m.label}</span>
            </div>
          ))}
        </div>
        {messages.length > 0 && (
          <button
            type="button"
            className="flex items-center justify-center leading-none gap-1 px-3 py-2 text-xl text-muted-foreground"
            onClick={clearChat}
          >
            <div className="i-mdi-refresh text-xl" />
            <span>新对话</span>
          </button>
        )}
      </div>

      {/* 联网搜索说明条 */}
      {searchMode === 'search' && (
        <div className="flex items-center gap-2 px-4 py-2 bg-secondary border-b border-border">
          <div className="i-mdi-lightning-bolt text-xl text-primary flex-shrink-0" />
          <p className="text-xl text-primary">已启用百度联网搜索，可获取最新法律动态</p>
        </div>
      )}

      {/* 消息列表 */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center pt-8">
            {searchMode === 'search' ? (
              <>
                <div className="i-mdi-web text-6xl text-primary opacity-30 mb-4" />
                <p className="text-xl text-muted-foreground mb-2">联网搜索法律知识</p>
                <p className="text-xl text-muted-foreground mb-8">实时获取最新法规和案例</p>
              </>
            ) : (
              <>
                <div className="i-mdi-scale-balance text-6xl text-primary opacity-30 mb-4" />
                <p className="text-xl text-muted-foreground mb-2">向法律助手提问</p>
                <p className="text-xl text-muted-foreground mb-8">获取专业法律建议</p>
              </>
            )}
            <div className="w-full flex flex-col gap-3">
              <p className="text-xl font-medium text-foreground">常见问题</p>
              {QUICK_QUESTIONS.map((q) => (
                <div
                  key={q}
                  className="px-4 py-3 bg-card rounded-xl border border-border flex items-center justify-between transition-all active:scale-95"
                  onClick={() => sendMessage(q)}
                >
                  <span className="text-xl text-foreground">{q}</span>
                  <div className="i-mdi-chevron-right text-xl text-muted-foreground" />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div>
            {messages.map((msg, idx) => (
              <MessageBubble
                key={msg.timestamp}
                msg={msg}
                isLast={idx === messages.length - 1}
                onSuggest={(q) => sendMessage(q)}
                onFeedback={msg.role === 'assistant' && msg.historyId
                  ? (val) => handleFeedback(msg.historyId!, val)
                  : undefined}
              />
            ))}
            {loading && (
              <div className="flex justify-start mb-4">
                <div className="flex items-start gap-2">
                  <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center flex-shrink-0 mt-1">
                    <div className={`${searchMode === 'search' ? 'i-mdi-web' : 'i-mdi-scale-balance'} text-xl text-primary-foreground`} />
                  </div>
                  <div className="px-4 py-3 bg-card rounded-2xl rounded-tl-sm border border-border">
                    <div className="flex items-center gap-2">
                      <div className="i-mdi-loading text-2xl text-primary animate-spin" />
                      <span className="text-xl text-muted-foreground">
                        {searchMode === 'search' ? '联网搜索中...' : '正在分析...'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 输入区 */}
      <div className="bg-card border-t border-border px-4 py-3">
        <div className="flex items-end gap-3">
          <div className="flex-1 border border-input rounded-2xl px-4 py-3 bg-background overflow-hidden">
            <textarea
              className="w-full text-xl text-foreground bg-transparent outline-none"
              style={{ height: '80px', resize: 'none' }}
              placeholder={searchMode === 'search' ? '搜索法律问题、法规、案例...' : '输入您的法律问题...'}
              value={input}
              onInput={(e) => { const ev = e as any; setInput(ev.detail?.value ?? ev.target?.value ?? '') }}
            />
          </div>
          <button
            type="button"
            className="flex items-center justify-center leading-none w-12 h-12 rounded-2xl bg-primary transition-all active:scale-95"
            style={{ opacity: loading || !input.trim() ? 0.5 : 1 }}
            onClick={() => sendMessage(input)}
          >
            <div className={`${searchMode === 'search' ? 'i-mdi-magnify' : 'i-mdi-send'} text-2xl text-primary-foreground`} />
          </button>
        </div>
      </div>
    </div>
  )
}
