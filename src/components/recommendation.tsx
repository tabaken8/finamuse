// components/recommendation.tsx
"use client"

import { useMemo, useState } from "react"
import {
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer
} from "recharts"
import { cn } from "@/lib/utils"

type Props = {
  existingTickers: string[]               // すでに追加済み（disable 用）
  onAddMany: (symbols: string[]) => void  // 一括追加
}

type Candidate = {
  ticker: string
  name: string
  tags: string[] // UI フィルタ用
  // 5軸スコア（0-5）： 安定 / 成長 / 配当 / インフレ耐性 / 為替分散
  profile: [number, number, number, number, number]
}

/** 米国ETF/株 ＋ 日本株（.T）を追加 */
const CANDIDATES: Candidate[] = [
  // ==== 米国（前回と同じ） ====
  { ticker: "SPY",  name: "S&P 500 ETF",                 tags:["米国株","広く分散","大型株"],   profile:[4,4,2,2,1] },
  { ticker: "VTI",  name: "米国全市場ETF",               tags:["米国株","広く分散"],            profile:[4,4,2,2,1] },
  { ticker: "QQQ",  name: "NASDAQ 100 ETF",              tags:["成長","テック"],                profile:[2,5,1,1,1] },
  { ticker: "VXUS", name: "米国外株式ETF",               tags:["海外分散"],                     profile:[3,3,2,2,5] },
  { ticker: "AGG",  name: "米国総合債券ETF",             tags:["債券","安定"],                  profile:[5,1,2,1,1] },
  { ticker: "TLT",  name: "米国長期国債ETF",             tags:["債券","金利感応"],              profile:[3,1,2,1,1] },
  { ticker: "GLD",  name: "金ETF",                        tags:["コモディティ","インフレ耐性"],  profile:[3,1,0,5,3] },
  { ticker: "XLE",  name: "エネルギーETF",                tags:["インフレ耐性","景気敏感"],      profile:[2,3,2,4,1] },
  { ticker: "HDV",  name: "米国高配当ETF",               tags:["配当","安定"],                  profile:[4,2,5,2,1] },
  { ticker: "VYM",  name: "米国高配当ETF(広く)",         tags:["配当","安定"],                  profile:[4,2,5,2,1] },

  // ==== 日本（TOPIX 500 主要どころ） ====
  { ticker: "7203.T", name: "トヨタ自動車",                tags:["日本株","自動車","大型","輸出"],       profile:[5,3,2,2,3] },
  { ticker: "6758.T", name: "ソニーグループ",              tags:["日本株","エレクトロニクス","エンタメ"], profile:[4,4,1,1,3] },
  { ticker: "9984.T", name: "ソフトバンクグループ",        tags:["日本株","投資持株","テック"],          profile:[2,4,0,1,2] },
  { ticker: "9983.T", name: "ファーストリテイリング",      tags:["日本株","小売","グローバル"],          profile:[4,4,0,2,4] },
  { ticker: "8035.T", name: "東京エレクトロン",            tags:["日本株","半導体製造装置"],             profile:[3,5,1,1,3] },
  { ticker: "6861.T", name: "キーエンス",                  tags:["日本株","FA機器","高収益"],             profile:[4,4,1,1,3] },
  { ticker: "7974.T", name: "任天堂",                      tags:["日本株","ゲーム","コンテンツ"],         profile:[3,4,1,1,3] },
  { ticker: "8306.T", name: "三菱UFJフィナンシャルG",      tags:["日本株","銀行","金利敏感","配当"],      profile:[4,2,4,1,1] },
  { ticker: "8058.T", name: "三菱商事",                    tags:["日本株","商社","資源","配当"],           profile:[4,3,4,3,3] },
  { ticker: "8031.T", name: "三井物産",                    tags:["日本株","商社","資源","配当"],           profile:[4,3,4,3,3] },
  { ticker: "6501.T", name: "日立製作所",                  tags:["日本株","総合電機","ITソリューション"],  profile:[4,4,2,2,2] },
  { ticker: "6367.T", name: "ダイキン工業",                tags:["日本株","空調","グローバル"],           profile:[4,4,1,2,3] },
  { ticker: "4063.T", name: "信越化学工業",                tags:["日本株","化学","半導体材料"],           profile:[4,4,1,1,2] },
  { ticker: "6981.T", name: "村田製作所",                  tags:["日本株","電子部品"],                   profile:[3,4,1,1,3] },
  { ticker: "6594.T", name: "日本電産(Nidec)",             tags:["日本株","モーター","EV関連"],           profile:[3,4,0,1,3] },
  { ticker: "4543.T", name: "テルモ",                      tags:["日本株","医療機器","ディフェンシブ"],    profile:[4,3,1,1,2] },
  { ticker: "4502.T", name: "武田薬品工業",                tags:["日本株","医薬","ディフェンシブ","配当"], profile:[4,2,4,1,2] },
  { ticker: "3382.T", name: "セブン&アイ・ホールディングス", tags:["日本株","小売","ディフェンシブ"],       profile:[4,2,2,2,1] },
  { ticker: "6098.T", name: "リクルートホールディングス",   tags:["日本株","人材","IT"],                   profile:[3,4,0,1,2] },
  { ticker: "2413.T", name: "エムスリー",                  tags:["日本株","医療IT","成長"],               profile:[2,4,0,1,2] },
  { ticker: "9432.T", name: "日本電信電話(NTT)",           tags:["日本株","通信","ディフェンシブ","配当"], profile:[5,1,4,1,1] },
  { ticker: "9433.T", name: "KDDI",                        tags:["日本株","通信","ディフェンシブ","配当"], profile:[5,1,4,1,1] },
  { ticker: "9434.T", name: "ソフトバンク(通信)",           tags:["日本株","通信","配当"],                 profile:[4,1,5,1,1] },
  { ticker: "7270.T", name: "SUBARU",                      tags:["日本株","自動車","輸出"],               profile:[3,3,2,2,3] },
  { ticker: "7267.T", name: "ホンダ",                      tags:["日本株","自動車","輸出"],               profile:[4,3,2,2,3] },
  { ticker: "6752.T", name: "パナソニックHD",              tags:["日本株","電機"],                       profile:[3,3,2,1,2] },
  { ticker: "4661.T", name: "オリエンタルランド",           tags:["日本株","レジャー","内需"],             profile:[4,3,0,1,1] },
  { ticker: "2914.T", name: "日本たばこ産業(JT)",          tags:["日本株","食品","配当"],                 profile:[4,2,5,2,2] },
  { ticker: "7201.T", name: "日産自動車",                  tags:["日本株","自動車","輸出"],               profile:[2,3,1,2,3] },
  { ticker: "6750.T", name: "エレコム",                    tags:["日本株","周辺機器"],                   profile:[3,3,2,1,1] },
  // 代表的な日本ETF
  { ticker: "1306.T", name: "TOPIX連動型上場投資信託",      tags:["日本株","ETF","広く分散"],             profile:[5,3,2,2,1] },
  { ticker: "1305.T", name: "ダイワETF・TOPIX",             tags:["日本株","ETF","広く分散"],             profile:[5,3,2,2,1] },
  { ticker: "1321.T", name: "日経225連動型上場投資信託",    tags:["日本株","ETF","大型"],                 profile:[4,3,2,2,1] },
]

const AXES = ["安定","成長","配当","インフレ耐性","為替分散"] as const

export default function Recommendation({ existingTickers, onAddMany }: Props) {
  const [tab, setTab] = useState<"list"|"custom">("list")
  const [selected, setSelected] = useState<string[]>([])
  const [filter, setFilter] = useState<string>("")
  const [weights, setWeights] = useState<[number,number,number,number,number]>([3,3,3,3,3]) // 初期フラット

  const toggle = (t: string) => {
    setSelected(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])
  }

  const filtered = useMemo(() => {
    if (!filter) return CANDIDATES
    const f = filter.toLowerCase()
    return CANDIDATES.filter(c =>
      c.ticker.toLowerCase().includes(f)
      || c.name.toLowerCase().includes(f)
      || c.tags.some(tag => tag.toLowerCase().includes(f))
    )
  }, [filter])

  // カスタマイズ：重み × プロファイル の線形スコア
  const ranked = useMemo(() => {
    const w = weights
    return [...CANDIDATES]
      .map(c => {
        const s = c.profile.reduce((acc, v, i) => acc + v * w[i], 0)
        return { ...c, score: s }
      })
      .sort((a,b) => b.score - a.score)
      .slice(0, 12)
  }, [weights])

  const radarData = AXES.map((axis, i) => ({
    axis,
    value: weights[i]
  }))

  const addChecked = () => {
    const toAdd = selected.filter(t => !existingTickers.includes(t))
    if (toAdd.length > 0) onAddMany(toAdd)
    setSelected([])
  }

  const addOne = (t: string) => {
    if (!existingTickers.includes(t)) onAddMany([t])
  }

  return (
    <div className="rounded-2xl border bg-white/80 p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <div className="text-lg font-bold">あなたにおすすめの銘柄</div>
        <div className="ml-auto flex items-center gap-2 rounded-xl bg-gray-100 p-1">
          <button
            className={cn("px-3 py-1 rounded-lg text-sm", tab==="list" ? "bg-purple-600 text-white" : "hover:bg-white")}
            onClick={() => setTab("list")}
          >
            おすすめ
          </button>
          <button
            className={cn("px-3 py-1 rounded-lg text-sm", tab==="custom" ? "bg-purple-600 text-white" : "hover:bg-white")}
            onClick={() => setTab("custom")}
          >
            カスタマイズ
          </button>
        </div>
      </div>

      {tab === "list" ? (
        <>
          {/* 検索 & 一括追加 */}
          <div className="mb-3 flex items-center gap-2">
            <input
              className="w-72 rounded-md border px-2 py-1 text-sm"
              placeholder="銘柄/キーワードで絞り込み（例: 高配当, 半導体, ETF）"
              value={filter}
              onChange={(e)=>setFilter(e.target.value)}
            />
            <button
              className="ml-auto rounded-lg bg-purple-600 px-3 py-1.5 text-white text-sm disabled:opacity-50"
              disabled={selected.length===0}
              onClick={addChecked}
            >
              選択を一括追加（{selected.length}）
            </button>
          </div>

          {/* リスト（チェックして一括 or 個別追加） */}
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map(c => {
              const disabled = existingTickers.includes(c.ticker)
              const checked = selected.includes(c.ticker)
              return (
                <label key={c.ticker} className={cn(
                  "flex items-center justify-between rounded-xl border p-3",
                  disabled ? "opacity-50" : "hover:bg-gray-50"
                )}>
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={disabled}
                      onChange={()=>toggle(c.ticker)}
                    />
                    <div>
                      <div className="font-semibold">
                        {c.ticker} <span className="text-gray-500 text-xs">/ {c.name}</span>
                      </div>
                      <div className="mt-0.5 text-xs text-gray-500">{c.tags.join(" ・ ")}</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="rounded-md border px-2 py-1 text-xs hover:bg-gray-100 disabled:opacity-40"
                    disabled={disabled}
                    onClick={()=>addOne(c.ticker)}
                  >
                    追加
                  </button>
                </label>
              )
            })}
          </div>
        </>
      ) : (
        <>
          {/* 5角形レーダー（重み） */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="col-span-1 md:col-span-1 h-56">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData}>
                  <PolarGrid />
                  <PolarAngleAxis dataKey="axis" />
                  <PolarRadiusAxis angle={30} domain={[0,5]} tickCount={6}/>
                  <Radar dataKey="value" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.35}/>
                </RadarChart>
              </ResponsiveContainer>
            </div>
            <div className="col-span-1 md:col-span-2">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {AXES.map((axis, i)=>(
                  <label key={axis} className="flex items-center gap-3">
                    <div className="w-24 text-sm text-gray-600">{axis}</div>
                    <input
                      type="range" min={0} max={5} step={1}
                      value={weights[i]}
                      onChange={(e)=>{
                        const v = parseInt(e.target.value,10)
                        const next:[number,number,number,number,number]=[...weights] as any
                        next[i]=v; setWeights(next)
                      }}
                      className="w-full"
                    />
                    <span className="w-8 text-right text-sm">{weights[i]}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* おすすめ上位（重み反映） */}
          <div className="mt-3 text-sm font-semibold">あなた向けの候補（上位）</div>
          <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
            {ranked.map(c=>(
              <div key={c.ticker} className="flex items-center justify-between rounded-xl border p-3 hover:bg-gray-50">
                <div>
                  <div className="font-semibold">
                    {c.ticker} <span className="text-gray-500 text-xs">/ {c.name}</span>
                  </div>
                  <div className="mt-0.5 text-xs text-gray-500">{c.tags.join(" ・ ")}</div>
                </div>
                <button
                  className="rounded-md border px-2 py-1 text-xs hover:bg-gray-100 disabled:opacity-40"
                  disabled={existingTickers.includes(c.ticker)}
                  onClick={()=>addOne(c.ticker)}
                >
                  追加
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
