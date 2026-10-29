import fs from 'node:fs'
import readline from 'node:readline'

async function run() {
  const fileStream = fs.createReadStream('C:\\Users\\ADMIN\\.gemini\\antigravity\\brain\\40f57585-80f6-4235-974d-59729838b0d3\\.system_generated\\logs\\transcript_full.jsonl')
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity })

  let md = '# Riwayat Obrolan & Perjalanan Proyek: Warung Metal 🤘\n\n'
  md += '> Dokumen ini berisi rekaman lengkap diskusi, brainstorming, keputusan arsitektur, hingga implementasi aplikasi kasir **Warung Metal** dari awal sampai selesai.\n\n---\n\n'

  let turn = 1
  for await (const line of rl) {
    if (!line.trim()) continue
    try {
      const entry = JSON.parse(line)
      if (entry.type === 'USER_INPUT') {
        const timeStr = entry.created_at ? new Date(entry.created_at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) : ''
        md += `## Percakapan #${turn}\n\n`
        md += `### 👤 User (${timeStr} WIB)\n\n`
        // Bersihkan tag internal sistem jika ada
        let cleanContent = entry.content
          .replace(/<ADDITIONAL_METADATA>[\s\S]*?<\/ADDITIONAL_METADATA>/g, '')
          .replace(/<USER_SETTINGS_CHANGE>[\s\S]*?<\/USER_SETTINGS_CHANGE>/g, '')
          .replace(/<USER_REQUEST>/g, '')
          .replace(/<\/USER_REQUEST>/g, '')
          .trim()
        md += `${cleanContent}\n\n`
      } else if (entry.type === 'PLANNER_RESPONSE' && entry.content && entry.content.trim()) {
        const timeStr = entry.created_at ? new Date(entry.created_at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) : ''
        md += `### 🤖 AI Assistant (${timeStr} WIB)\n\n`
        md += `${entry.content.trim()}\n\n---\n\n`
        turn++
      }
    } catch {}
  }

  const outPath = 'C:\\Users\\ADMIN\\.gemini\\antigravity\\scratch\\warung-metal\\CHAT_HISTORY.md'
  fs.writeFileSync(outPath, md, 'utf-8')
  console.log('CHAT_HISTORY.md berhasil dibuat!')

  // Salin juga file transcript mentah ke docs/logs/ agar lengkap jika dibutuhkan raw jsonl
  const docsDir = 'C:\\Users\\ADMIN\\.gemini\\antigravity\\scratch\\warung-metal\\docs'
  const logsDir = `${docsDir}\\logs`
  fs.mkdirSync(logsDir, { recursive: true })
  fs.copyFileSync(
    'C:\\Users\\ADMIN\\.gemini\\antigravity\\brain\\40f57585-80f6-4235-974d-59729838b0d3\\.system_generated\\logs\\transcript_full.jsonl',
    `${logsDir}\\transcript_full.jsonl`
  )

  const planPath = 'C:\\Users\\ADMIN\\.gemini\\antigravity\\brain\\40f57585-80f6-4235-974d-59729838b0d3\\rencana-kasir-warung.md'
  if (fs.existsSync(planPath)) {
    fs.copyFileSync(planPath, `${docsDir}\\DESAIN_ARSITEKTUR.md`)
    console.log('Dokumen desain arsitektur disalin ke docs/DESAIN_ARSITEKTUR.md')
  }
  console.log('Log mentah berhasil disalin ke docs/logs/!')
}

run()
