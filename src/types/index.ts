export interface UserProgress {
  totalExp: number;         // 累計EXP（原稿攻撃力）
  coins: number;            // 獲得コイン
  currentStreak: number;    // 連続達成日数
  lastActiveDate: string;   // YYYY-MM-DD（未活動なら空文字）
  targetPages: number;      // 目標総ページ（または総文字数）
  completedPages: number;   // 完了ページ（文字数換算）
  deadline: string;         // イベント入稿締め切り日 (YYYY-MM-DD、未設定なら空文字)
  totalStrokes: number;     // クリスタ連携で数えた累計の線の本数
  totalStrokeLength: number; // 累計の線の長さ（画面上の px）
  totalUndos: number;       // 累計のやり直し（Ctrl+Z）回数
  totalStrokeMs: number;    // 累計のペンが触れていた時間（ms）
  totalTypedKeys: number;   // 累計のセリフ入力の打鍵数
  totalKeyOps: number;      // 累計のキー操作（ショートカット）回数
}

/** 1ページの工程: コマ割り / セリフ入れ / 下書き / ペン入れ / 仕上げ */
export type StageId = "paneling" | "dialogue" | "sketch" | "inking" | "finishing";

export interface ManuscriptPage {
  /** 工程ごとの完了時刻（ms）。未完了の工程はキーが無い */
  done: Partial<Record<StageId, number>>;
}

/** 原稿の進み具合（ページ × 工程） */
export interface Manuscript {
  pages: ManuscriptPage[];
  /** 原稿を始めた時刻（ms）。グラフの理想ペースの起点 */
  startedAt: number;
}

/** 1日ごとの記録（グラフ用） */
export interface DailyStats {
  exp: number;
  strokes: number;
  strokeMs: number;
  strokeLength: number;     // 線の長さ（px）
  zones: number;            // ZONE に入った回数
  undos: number;
  typedKeys: number;
  keyOps: number;
  saves: number;
  pomodoros: number;
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
  type: ProgressActionType | "stage";
  /** カットインに出す（読み上げる）セリフ */
  cutIn: string;
  /** ページの工程を完了したときはその内容 */
  stage?: { page: number; stage: StageId; pageComplete: boolean };
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
  level: number;            // lastActivityAt 時点の勢い (0-100)
  lastActivityAt: number;   // 最後に線を引いた・やり直した時刻（ms、未描画なら0）
  rush: number;             // 間を空けずに続けて引いた本数
  sessionStrokes: number;   // 勢いが0になるまでに引いた本数
  sessionLengthPx: number;  // 勢いが0になるまでに引いた線の長さ（px）
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
  zoneBlocked: boolean;     // 勢いは MAX だが、1日の上限・休憩中のため ZONE に入らなかった
  lengthMilestoneM: number | null; // 区切りの長さ（5m ごと）に達したらその長さ
  durationMs: number;
  lengthPx: number;
}

/** セリフ入力（キーボードでの連続した打鍵）1回分の結果 */
export interface TypingResult {
  id: number;
  keys: number;
  expGained: number;
  totalTypedKeys: number;
  milestone: boolean;       // 区切りの打鍵数（200打ごと）を超えた
  inZone: boolean;
}

/** やり直し（Ctrl+Z）1回分の結果 */
export interface UndoResult {
  id: number;
  expGained: number;
  totalUndos: number;
  milestone: boolean;       // 区切りの回数（25回ごと）に達した
}

export type VoiceModeSetting = "off" | "female" | "male" | "alternate";

/** 保存する設定 */
export interface AppSettings {
  isBgmOn: boolean;         // BGM を鳴らしてよいか（ON でも連続タップ中・描き続けている間のみ鳴る）
  isBridgeEnabled: boolean; // クリスタ連携ブリッジに接続するか
  isStrokeSoundOn: boolean; // 線・やり直しの効果音
  bgmNormalId: string;      // 作業中の BGM
  bgmFeverId: string;       // フィーバー・ゾーン中の BGM
  voiceMode: VoiceModeSetting; // カットインの読み上げ
  femaleVoiceUri: string;   // 女性の声（空なら自動）
  maleVoiceUri: string;     // 男性の声（空なら自動）
  ttsEngine: TtsEngine;     // 読み上げに使う声
  geminiFemaleCharacter: string;   // Gemini の女性キャラクター
  geminiMaleCharacter: string;     // Gemini の男性キャラクター
  voicevoxFemaleStyle: number;     // VOICEVOX の女性側の話者 ID
  voicevoxMaleStyle: number;       // VOICEVOX の男性側の話者 ID
  restBgmId: string;               // 休憩中に流すゆったりした BGM
  zoneDailyLimit: number;          // 1日に ZONE に入れる回数（修羅場モードでは無制限）
  shurabaMode: boolean;            // 修羅場モード（ZONE の上限なし）
}

export type ProjectType = "manga" | "illustration";

/** 原稿・イラストなど、作品ごとの記録 */
export interface Project {
  id: string;
  name: string;
  type: ProjectType;
  createdAt: number;
  /** 漫画: 総ページ数・入稿締め切り（イラストでは締め切りのみ任意） */
  targetPages: number;
  deadline: string;
  /** 漫画: ページ × 工程の記録（イラストでは空） */
  manuscript: Manuscript;
  /** 日ごとの記録（YYYY-MM-DD → 記録） */
  dailyStats: Record<string, DailyStats>;
}

export type PomodoroMode = "focus" | "break";

/** ポモドーロタイマー（ページを移動・再読込しても続くよう保存する） */
export interface PomodoroState {
  mode: PomodoroMode;
  /** 動いているときの終了時刻（ms）。止まっていれば null */
  endAt: number | null;
  /** 止まっているときの残り時間（ms） */
  pausedRemaining: number;
}

/** 読み上げの声: ブラウザ標準 / Gemini の自然な声 / VOICEVOX */
export type TtsEngine = "browser" | "gemini" | "voicevox";
