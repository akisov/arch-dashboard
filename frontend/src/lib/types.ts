export interface Task {
  key: string
  title: string
  url: string
  queue: string
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
