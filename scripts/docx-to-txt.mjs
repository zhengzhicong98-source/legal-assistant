#!/usr/bin/env node
// @ts-check
/**
 * docx-to-txt.mjs — 极简 docx 转纯文本（无外部依赖）
 * 用法: node docx-to-txt.mjs <input.docx> <output.txt>
 *
 * 原理: docx 是 zip 包，word/document.xml 里 <w:t> 标签之间是正文，
 *      <w:p> 标签间对应段落。用 Node 内置的 zlib 解 zip 中央目录 + inflate 拿到 xml。
 */
import { readFile, writeFile } from 'node:fs/promises'
import { inflateRawSync } from 'node:zlib'
import process from 'node:process'

const [, , inputPath, outputPath] = process.argv
if (!inputPath || !outputPath) {
  console.error('usage: node docx-to-txt.mjs <input.docx> <output.txt>')
  process.exit(1)
}

/** 从 zip 中央目录读取指定文件 */
function readZipEntry(buf, entryName) {
  // 找 EOCD (End of Central Directory)
  let eocdOff = -1
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65558); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocdOff = i; break }
  }
  if (eocdOff < 0) throw new Error('EOCD not found — not a valid zip')

  const cdOffset = buf.readUInt32LE(eocdOff + 16)
  const cdEntries = buf.readUInt16LE(eocdOff + 10)

  let off = cdOffset
  for (let i = 0; i < cdEntries; i++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) throw new Error('bad CD signature')
    const method = buf.readUInt16LE(off + 10)
    const compSize = buf.readUInt32LE(off + 20)
    const nameLen = buf.readUInt16LE(off + 28)
    const extraLen = buf.readUInt16LE(off + 30)
    const commentLen = buf.readUInt16LE(off + 32)
    const localHdrOff = buf.readUInt32LE(off + 42)
    const name = buf.slice(off + 46, off + 46 + nameLen).toString('utf8')

    if (name === entryName) {
      // 读 local file header
      if (buf.readUInt32LE(localHdrOff) !== 0x04034b50) throw new Error('bad LFH')
      const lfhNameLen = buf.readUInt16LE(localHdrOff + 26)
      const lfhExtraLen = buf.readUInt16LE(localHdrOff + 28)
      const dataOff = localHdrOff + 30 + lfhNameLen + lfhExtraLen
      const data = buf.slice(dataOff, dataOff + compSize)
      if (method === 0) return data
      if (method === 8) return inflateRawSync(data)
      throw new Error(`unsupported compression method ${method}`)
    }

    off += 46 + nameLen + extraLen + commentLen
  }
  throw new Error(`entry not found: ${entryName}`)
}

/** 从 document.xml 提取带段落分隔的纯文本 */
function xmlToText(xml) {
  const out = []
  // 每个 <w:p ...> 到 </w:p> 是一段
  const paraRe = /<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g
  let m
  while ((m = paraRe.exec(xml)) !== null) {
    const inner = m[1]
    // 收集所有 <w:t>...</w:t>（可能有 xml:space="preserve"）
    const tRe = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g
    const parts = []
    let mt
    while ((mt = tRe.exec(inner)) !== null) {
      parts.push(mt[1])
    }
    // 处理 <w:tab/> <w:br/>
    let line = parts.join('')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
    // 段落间如有 tab 保留一个空格
    line = line.replace(/\t/g, ' ')
    out.push(line)
  }
  return out.join('\n')
}

const buf = await readFile(inputPath)
const xmlBuf = readZipEntry(buf, 'word/document.xml')
const xml = xmlBuf.toString('utf8')
const text = xmlToText(xml)
await writeFile(outputPath, text, 'utf8')
console.log(`ok: ${text.length} chars → ${outputPath}`)
