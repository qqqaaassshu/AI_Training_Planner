export interface Exercise {
  name: string;
  sets: number;
  reps: number;
}

export interface PlanTask {
  id: string;
  title: string;
  type: "workout" | "habit";
  schedule: {
    weekday?: number[];
    daily?: boolean;
    time?: string;
  };
  exercises?: Exercise[];
  reminder: boolean;
}

export interface PlanVersion {
  id: string;
  version: number;
  plan_name: string;
  created_at: string;
  ai_summary?: string;
  start_date: string;
  end_date?: string;
  parent_version_id?: string;
  tasks: PlanTask[];
}

/** @deprecated Use PlanVersion */
export type Plan = PlanVersion;

export interface ActualExercise {
  name: string;
  sets: number;
  reps: number;
}

export interface ExecutionRecord {
  id: string;
  task_id: string;
  date: string;
  status: "completed" | "skipped" | "snoozed";
  completed_at: string;
  actual?: ActualExercise[];
  notes: string;
  pain_score?: number;
  fatigue_score?: number;
}

export interface DailyWellness {
  date: string;
  fatigue_score: number;
}

export interface ExportSummary {
  completion_rate: number;
  missed_tasks: string[];
  pain_average: number;
  fatigue_average: number;
}
