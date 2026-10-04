export interface UserProgress {
  totalExp: number;         // 累計EXP（原稿攻撃力）
  coins: number;            // 獲得コイン
  currentStreak: number;    // 連続達成日数
  lastActiveDate: string;   // YYYY-MM-DD（未活動なら空文字）
  targetPages: number;      // 目標総ページ（または総文字数）
  completedPages: number;   // 完了ページ（文字数換算）
  deadline: string;         // イベント入稿締め切り日 (YYYY-MM-DD、未設定なら空文字)
  totalStrokes: number;     // クリスタ連携で数えた累計の線の本数
}

export interface ComboState {
  comboCount: number;       // 現在のコンボ数
  isFever: boolean;         // フィーバーモード中かどうか
  feverMultiplier: number;  // 倍率 (1.0x, 1.5x, 2.0x)
  lastActionTime: number;   // 最終アクションのタイムスタンプ（ms、未アクションなら0）
}

/** 進捗アクションの種類: コマ割り / 1コマ描いた / 吹き出し / セリフ / 500文字書いた / クリスタで保存 */
export type ProgressActionType = "paneling" | "panel" | "balloon" | "dialogue" | "text" | "save";

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

/** クリスタ連携の「勢い」。線を引くたびに溜まり、手を止めると減っていく（保存しない） */
export interface FlowState {
  level: number;            // lastStrokeAt 時点の勢い (0-100)
  lastStrokeAt: number;     // 最後に線を引いた時刻（ms、未描画なら0）
  rush: number;             // 間を空けずに続けて引いた本数
  sessionStrokes: number;   // 勢いが0になるまでに引いた本数
  inZone: boolean;          // ゾーン（勢い MAX）中か
}

/** 線1本分の結果。演出のトリガーに使う */
export interface StrokeResult {
  id: number;
  expGained: number;
  coinsGained: number;
  multiplier: number;
  rush: number;
  sessionStrokes: number;
  inZone: boolean;
  enteredZone: boolean;     // この線でゾーンに入った
  milestone: boolean;       // 区切りの本数（50本ごと）に達した
  durationMs: number;
  lengthPx: number;
}
