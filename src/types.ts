export type Role = 'parent' | 'child';
export type ScreenKind = 'regular' | 'youtube';
export type Profile = {
  id: string;
  name: string;
  role: Role;
  balance: number;
};
export type Rule = {
  id: string;
  child_id: string;
  title: string;
  description: string;
  reward: number;
  daily_limit: number;
  sort_order: number;
};
export type TaskRequest = {
  id: string;
  child_id: string;
  rule_id: string;
  title: string;
  reward: number;
  note: string;
  status: 'pending' | 'approved' | 'rejected';
  task_day: string;
  created_at: string;
  reviewed_at: string | null;
};
export type Entry = {
  id: string;
  child_id: string;
  amount: number;
  reason: string;
  created_at: string;
};
export type Snapshot = {
  profiles: Profile[];
  rules: Rule[];
  requests: TaskRequest[];
  entries: Entry[];
};
type Table<Row> = {
  Row: Row;
  Insert: never;
  Update: never;
  Relationships: [];
};
export type Database = {
  public: {
    Tables: {
      profiles: Table<Profile>;
      rules: Table<Rule>;
      task_requests: Table<TaskRequest>;
      ledger: Table<Entry>;
    };
    Views: Record<string, never>;
    Functions: {
      submit_task: { Args: { p_rule_id: string; p_note: string }; Returns: string };
      review_task: { Args: { p_request_id: string; p_approve: boolean }; Returns: undefined };
      deduct_time: { Args: { p_child_id: string; p_minutes: number; p_kind: ScreenKind }; Returns: undefined };
      edit_rule: {
        Args: { p_rule_id: string; p_description: string; p_reward: number; p_daily_limit: number };
        Returns: undefined;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
