// app/diagnosis/page.tsx
"use client"

import { useEffect, useMemo, useState } from "react"
import {
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, Tooltip,
  LineChart, Line, XAxis, YAxis, CartesianGrid
} from "recharts"
import { supabase } from "@/lib/supabase"

type Question = {
  id: string
  text: string
  options: { label: string; value: string }[]
}

const QUESTIONS: Question[] = [
  {
    id: "risk",
    text: "100万円を1年投資。±20%の振れを想定すると？",
    options: [
      { label: "避けたい（安定志向）", value: "low" },
      { label: "一部なら挑戦", value: "medium" },
      { label: "全額挑戦（成長志向）", value: "high" },
    ],
  },
  {
    id: "lossAversion",
    text: "同じ10万円、損失と利益でどちらが強く響く？",
    options: [
      { label: "損失の方がずっと嫌", value: "loss" },
      { label: "どちらも同程度", value: "neutral" },
      { label: "利益の喜びの方が大きい", value: "gain" },
    ],
  },
  {
    id: "income",
    text: "1%で100万円当選の宝くじ vs 毎月1万円の確実収入",
    options: [
      { label: "毎月1万円の確実性を選ぶ", value: "stable" },
      { label: "宝くじに夢を賭ける", value: "lottery" },
    ],
  },
  {
    id: "amount",
    text: "“今”株に入れられる目安は？",
    options: [
      { label: "10万円以下", value: "small" },
      { label: "100万円前後", value: "mid" },
      { label: "1000万円以上", value: "large" },
    ],
  },
]

type Answers = Record<string, string>

type RecAsset = { ticker: string; weight: number; name?: string }

const COLORS = [
  "#3b82f6", "#ef4444", "#10b981", "#f59e0b", "#8b5cf6",
  "#22c55e", "#0ea5e9", "#a855f7", "#14b8a6", "#f97316"
]

const MAN_YEN = 10_000

export default function DiagnosisPage() {
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<Answers>({})
  const finished = step >= QUESTIONS.length
  const currentQ = QUESTIONS[step]

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">投資タイプ診断</h1>

      {!finished ? (
        <div className="space-y-4 max-w-2xl">
          <p className="text-lg font-medium">{currentQ.text}</p>
          <div className="space-y-2">
            {currentQ.options.map((opt) => (
              <button
                key={opt.value}
                onClick={() => {
                  setAnswers({ ...answers, [currentQ.id]: opt.value })
                  setStep(step + 1)
                }}
                className="block w-full rounded-lg border p-3 text-left hover:bg-gray-50 bg-white"
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div className="text-sm text-gray-500">
            {step + 1} / {QUESTIONS.length}
          </div>
        </div>
      ) : (
        <Result answers={answers} />
      )}
    </div>
  )
}

/** 回答から “銘柄” のPFを作る（叩き台） */
function recommendPortfolio(answers: Answers): RecAsset[] {
  // できるだけ既出のティッカー（DBにありそうなもの）を使用
  if (answers.risk === "high") {
    // 成長寄り
    return [
      { ticker: "QQQ",   weight: 40 }, // 米グロース
      { ticker: "SPY",   weight: 25 }, // 米大型分散
      { ticker: "8035.T", weight: 15 }, // 東エレ
      { ticker: "7974.T", weight: 10 }, // 任天堂
      { ticker: "VXUS",  weight: 10 }, // 米国外株
    ]
  }
  if (answers.risk === "low" || answers.lossAversion === "loss" || answers.income === "stable") {
    // 安定・インカム寄り
    return [
      { ticker: "SPY",   weight: 25 },
      { ticker: "VTI",   weight: 15 },
      { ticker: "1306.T", weight: 20 }, // TOPIX
      { ticker: "AGG",   weight: 25 },  // 債券
      { ticker: "GLD",   weight: 15 },  // 金
    ]
  }
  // バランス型
  return [
    { ticker: "SPY",   weight: 30 },
    { ticker: "VTI",   weight: 20 },
    { ticker: "1306.T", weight: 20 },
    { ticker: "AGG",   weight: 20 },
    { ticker: "GLD",   weight: 10 },
  ]
}

type PriceRecord = { date: string; ticker: string; close: number }

function Result({ answers }: { answers: Answers }) {
  const profile = {
    安定: answers.risk === "low" ? 5 : 2,
    成長: answers.risk === "high" ? 5 : 3,
    損失回避性: answers.lossAversion === "loss" ? 5 : 2,
    夢志向: answers.income === "lottery" ? 5 : 1,
    投資余力: answers.amount === "large" ? 5 : answers.amount === "mid" ? 3 : 1,
  }
  const radarData = Object.entries(profile).map(([axis, value]) => ({ axis, value }))

  const recPF = useMemo(() => recommendPortfolio(answers), [answers])

  // ------------- 価格取得（過去5年）＆資産推移 -------------
  const [loading, setLoading] = useState(true)
  const [series, setSeries] = useState<PriceRecord[]>([])
  const [aumSeries, setAumSeries] = useState<Array<{date: string; total: number}>>([])

  // 初期投資額（円）— とりあえず固定 100万円（必要なら入力UIに差し替えOK）
  const baseAum = 100 * MAN_YEN

  useEffect(() => {
    const run = async () => {
      if (recPF.length === 0) return
      setLoading(true)

      const tickers = recPF.map(x => x.ticker)
      const fiveYearsAgoISO = (() => {
        const d = new Date()
        d.setUTCFullYear(d.getUTCFullYear() - 5)
        // 月初に寄せすぎると欠損が増えることがあるのでそのままの日付で
        return d.toISOString().slice(0, 10)
      })()

      const pageSize = 1000
      let from = 0
      let all: any[] = []

      // ページング + 期間フィルタ
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { data: rows, error } = await supabase
          .from("prices")
          .select("date, ticker, close")
          .in("ticker", tickers)
          .gte("date", fiveYearsAgoISO)
          .order("date", { ascending: true })
          .range(from, from + pageSize - 1)

        if (error) {
          console.error(error)
          setSeries([])
          setAumSeries([])
          setLoading(false)
          return
        }
        if (!rows || rows.length === 0) break
        all = all.concat(rows)
        if (rows.length < pageSize) break
        from += pageSize
      }

      const parsed: PriceRecord[] = (all ?? []).map((r: any) => ({
        date: r.date,
        ticker: r.ticker,
        close: typeof r.close === "number" ? r.close : parseFloat(r.close as any),
      }))

      // 全日付（昇順）
      const allDates = Array.from(new Set(parsed.map(r => r.date))).sort()

      // 銘柄ごとに全日付分を作成して forward/backward fill
      const groupedByTicker: Record<string, PriceRecord[]> = {}
      tickers.forEach(t => {
        const map = new Map(parsed.filter(r => r.ticker === t).map(r => [r.date, r.close]))
        const filled: PriceRecord[] = allDates.map(d => ({
          date: d, ticker: t, close: (map.get(d) ?? (NaN as any))
        }))

        // forward fill
        let last: number | null = null
        for (let i = 0; i < filled.length; i++) {
          const c = filled[i].close as any
          if (c == null || isNaN(c)) {
            filled[i].close = last as any
          } else {
            last = c as number
          }
        }
        // backward fill（先頭側）
        let nextValid: number | null = null
        for (let i = filled.length - 1; i >= 0; i--) {
          const c = filled[i].close as any
          if (c == null || isNaN(c)) {
            filled[i].close = nextValid as any
          } else {
            nextValid = c as number
          }
        }
        groupedByTicker[t] = filled
      })

      setSeries(Object.values(groupedByTicker).flat())

      // ---- 加重指数（開始=1）→ AUM（円） ----
      const weights: Record<string, number> = {}
      recPF.forEach(r => { weights[r.ticker] = r.weight })

      const sumW = Object.values(weights).reduce((a, b) => a + b, 0) || 1
      const base: Record<string, number> = {}
      Object.keys(groupedByTicker).forEach(t => {
        base[t] = groupedByTicker[t]?.[0]?.close ?? 1
      })

      const totalSeries = allDates.map(date => {
        let totalIndex = 0
        for (const t of Object.keys(groupedByTicker)) {
          const row = groupedByTicker[t].find(r => r.date === date)
          const price = row?.close ?? base[t]
          const norm = price / base[t]
          totalIndex += (weights[t] ?? 0) * norm
        }
        const idx = totalIndex / sumW
        return { date, total: baseAum * idx }
      })

      setAumSeries(totalSeries)
      setLoading(false)
    }

    run()
  }, [JSON.stringify(recPF)]) // recPF が変われば再取得

  // レーダー & 円グラフデータ
  const pieData = useMemo(
    () => recPF.map((r) => ({ name: r.ticker, value: r.weight })),
    [recPF]
  )

  const lastDate = useMemo(
    () => (aumSeries.length ? aumSeries[aumSeries.length - 1].date : ""),
    [aumSeries]
  )

  const numberFmt = useMemo(() => new Intl.NumberFormat("ja-JP"), [])
  const yen = (n: number) => `¥${numberFmt.format(Math.round(n))}`

  return (
    <div className="space-y-8">
      {/* レーダー：タイプ可視化 */}
      <div className="rounded-2xl border bg-white p-4">
        <h2 className="text-xl font-bold mb-2">診断結果（タイプ可視化）</h2>
        <div className="h-64 w-full">
          <ResponsiveContainer>
            <RadarChart data={radarData}>
              <PolarGrid />
              <PolarAngleAxis dataKey="axis" />
              <PolarRadiusAxis angle={30} domain={[0, 5]} tickCount={6} />
              <Radar name="あなた" dataKey="value" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.4} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* おすすめPF：銘柄の円グラフ */}
      <div className="rounded-2xl border bg-white p-4">
        <h2 className="text-xl font-bold mb-4">おすすめポートフォリオ（銘柄配分）</h2>
        <div className="h-80 w-full">
          <ResponsiveContainer>
            <PieChart>
              <Pie
                data={pieData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={110}
                label
                isAnimationActive={false}
              >
                {pieData.map((entry, index) => (
                  <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Legend />
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-2 text-sm text-gray-600">
          ※ この配分は診断の回答に基づく叩き台です。後で /dashboard で微調整可能にする想定です。
        </div>
      </div>

      {/* 5年間の資産推移（AUM） */}
      <div className="rounded-2xl border bg-white p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-xl font-bold">5年間の資産推移（初期 100万円）</h2>
          <div className="text-sm text-gray-700">
            最終日（{lastDate || "-"}）時点：<span className="font-semibold">
              {aumSeries.length ? yen(aumSeries[aumSeries.length - 1].total) : "-"}
            </span>
          </div>
        </div>

        {loading ? (
          <div className="p-8 text-sm text-gray-500">計算中…</div>
        ) : (
          <div className="h-96 w-full">
            <ResponsiveContainer>
              <LineChart data={aumSeries} margin={{ top: 12, right: 24, bottom: 8, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis tickFormatter={(v) => numberFmt.format(Math.round(v / 1_0000)) + "万円"} />
                <Tooltip formatter={(v: any) => yen(v)} />
                <Line type="monotone" dataKey="total" name="AUM" stroke="#8b5cf6" strokeWidth={4} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  )
}
