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

export interface Plan {
  plan_name: string;
  start_date: string;
  tasks: PlanTask[];
}

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
}
