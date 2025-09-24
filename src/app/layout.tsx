// app/layout.tsx
import "./globals.css"
import type { Metadata } from "next"
import { Inter } from "next/font/google"
import { LayoutDashboard, Info, Settings, Activity } from "lucide-react"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "Finamuse",
  description: "投資シミュレーション & 資産管理アプリ",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ja">
      <body
        className={`${inter.className} min-h-screen bg-gradient-to-br from-gray-50 via-blue-50 to-purple-50 text-gray-900 flex`}
      >
        {/* Sidebar */}
        <aside className="w-70 border-r bg-white/70 backdrop-blur-sm sticky top-0 h-screen flex flex-col p-8">
          <h1 className="text-xl font-bold mb-8 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            Finamuse
          </h1>
          
          <nav className="flex flex-col space-y-4 text-gray-700 text-sm">
            <a
              href="/dashboard"
              className="flex items-center gap-3 p-2 rounded-md hover:bg-blue-50 hover:text-blue-600"
            >
              <LayoutDashboard size={18} />
              ダッシュボード
            </a>
            <a
              href="/diagnosis"
              className="flex items-center gap-3 p-2 rounded-md hover:bg-blue-50 hover:text-blue-600"
              id="diagnosis"            // ← ref=diagnosis 相当で識別できるように
              data-ref="diagnosis"      // ← 必要ならこちらを参照
            >
              <Activity size={18} />
              診断
            </a>
            <a
              href="/about"
              className="flex items-center gap-3 p-2 rounded-md hover:bg-blue-50 hover:text-blue-600"
            >
              <Info size={18} />
              About Us
            </a>
            <a
              href="/settings"
              className="flex items-center gap-3 p-2 rounded-md hover:bg-blue-50 hover:text-blue-600"
            >
              <Settings size={18} />
              設定
            </a>
          </nav>
        </aside>

        {/* Main Content */}
        <div className="flex-1 flex flex-col">
          <header className="p-4 shadow-md bg-white/70 backdrop-blur-sm sticky top-0 z-50 flex justify-between items-center">
            <h1 className="text-lg font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              {/* Finamuse */}
            </h1>
          </header>

          <main className="p-6">{children}</main>

          <footer className="mt-auto py-6 text-center text-sm text-gray-500 border-t bg-white/50 backdrop-blur-sm">
            © {new Date().getFullYear()} Finamuse
          </footer>
        </div>
      </body>
    </html>
  )
}
