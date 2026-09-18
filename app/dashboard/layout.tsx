import Link from "next/link"
import { LayoutDashboard, FileText, Sparkles, Upload } from "lucide-react"

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const navItems = [
    { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
    { href: "/dashboard/topics", label: "Topics", icon: FileText },
    { href: "/dashboard/scenes", label: "Scenes", icon: Sparkles },
    { href: "/dashboard/uploads", label: "Uploads", icon: Upload },
  ]

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <aside className="w-64 border-r bg-card flex flex-col shrink-0">
        <div className="px-6 py-5 border-b">
          <h1 className="text-xl font-bold text-primary leading-tight">YT Shorts Auto</h1>
          <p className="text-sm text-muted-foreground leading-tight mt-0.5">Automation Dashboard</p>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 px-3 py-2 rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              <item.icon className="h-5 w-5" />
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 min-w-0 flex flex-col">
        {children}
      </main>
    </div>
  )
}
