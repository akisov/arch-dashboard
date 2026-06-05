export interface Task {
  key: string
  title: string
  url: string
  queue: string
  issueType: string       // story | analytics | technicaldebt | improvement | elaboration
  issueTypeDisplay: string // Человекочитаемое название
  entryDate: string | null
  v1n: number
  v2n: number
  total: number
}

export interface QueueData {
  tasks: Task[]
}

export interface DashboardData {
  tasks: Task[]
  queues: Record<string, QueueData>
  dateFrom: string
  dateTo: string
}

export interface SyncInfo {
  [queue: string]: string
}

export interface ArchTask {
  key: string
  title: string
  url: string
  queue: string
  issueType: string
  issueTypeDisplay: string
  status: string
  statusKey: string
  assignee: string
  since: string
  daysInStatus: number
  v1n: number   // возвратов от АрхКома (на ревью аналитики)
  v2n: number   // возвратов от ТА (на доработку)
}
