"use client"

import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"

export default function CreateSeriesButton() {
  return (
    <Button
      className="gap-2"
      onClick={() => (window.location.href = "/dashboard/onboarding")}
    >
      <Plus className="w-4 h-4" />
      Create Channel / Series
    </Button>
  )
}
