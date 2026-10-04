export interface UserProgress {
  totalExp: number;         // 累計EXP（原稿攻撃力）
  coins: number;            // 獲得コイン
  currentStreak: number;    // 連続達成日数
  lastActiveDate: string;   // YYYY-MM-DD（未活動なら空文字）
  targetPages: number;      // 目標総ページ（または総文字数）
  completedPages: number;   // 完了ページ（文字数換算）
  deadline: string;         // イベント入稿締め切り日 (YYYY-MM-DD、未設定なら空文字)
}

export interface ComboState {
  comboCount: number;       // 現在のコンボ数
  isFever: boolean;         // フィーバーモード中かどうか
  feverMultiplier: number;  // 倍率 (1.0x, 1.5x, 2.0x)
  lastActionTime: number;   // 最終アクションのタイムスタンプ（ms、未アクションなら0）
}

/** 進捗ボタンの種類: コマ割り / 1コマ描いた / 吹き出し / セリフ / 500文字書いた */
export type ProgressActionType = "paneling" | "panel" | "balloon" | "dialogue" | "text";

/** 進捗アクション1回分の結果。EffectOverlay などの演出トリガーに使う */
export interface ProgressActionResult {
  type: ProgressActionType;
  expGained: number;
  coinsGained: number;
  comboCount: number;
  feverMultiplier: number;
  isFever: boolean;
  enteredFever: boolean;    // このアクションでフィーバーに突入した
  multiplierUp: boolean;    // このアクションで倍率が上がった
  goalReached: boolean;     // このアクションで目標を達成した
  currentStreak: number;
}
