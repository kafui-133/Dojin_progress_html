# アプリ仕様書：『進捗ブースター（Syuraba Booster）』

## 1. プロジェクト概要
* **アプリ名:** 進捗ブースター（Syuraba Booster）
* **コンセプト:** 同人誌の原稿作業を「パチンコ・スマホ広告ゲーム」の感覚で脳汁（ドパミン）が出る快感体験に変え、継続・完了に導く修羅場専用・ゲーミフィケーション習慣化Webアプリ。
* **ターゲット:** 同人作家（イラストレーター・漫画家・小説家・同人文章執筆者）

---

## 2. 技術スタック（Claude Code構築向け）
* **Frontend Framework:** Next.js (App Router, TypeScript)
* **Styling:** Tailwind CSS + shadcn/ui
* **Animation / Effects:** Framer Motion + `canvas-confetti` (紙吹雪/エフェクト)
* **Sound:** Howler.js (効果音SE・BGM管理)
* **State Management:** Zustand (軽量でローカル状態管理に最適)
* **Persistence:** LocalStorage (初期段階ではバックエンドレス・完全ローカル動作)

---

## 3. ディレクトリ構造・ファイル設計
```text
syuraba-booster/
├── public/
│   ├── sounds/             # SE・BGMファイル (se_click.mp3, bgm_fever.mp3等)
│   └── images/             # ドット絵・スタンプ・キャラクター画像
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   └── page.tsx        # メインダッシュボード画面
│   ├── components/
│   │   ├── Header.tsx      # ストリーク・コイン・倍率表示
│   │   ├── VisualStage.tsx # 進捗連動ビジュアル（原稿用紙/作業部屋）
│   │   ├── ActionPanel.tsx # 1コマ/500文字 進捗タップボタン（メイン演出）
│   │   ├── EffectOverlay.tsx# パチンコ風カットイン・光・数字暴走エフェクト
│   │   ├── Timer.tsx       # 25分ポモドーロタイマー
│   │   └── ShareModal.tsx  # X(Twitter)進捗画像生成＆報告ダイアログ
│   ├── store/
│   │   └── useAppStore.ts  # 進捗、コイン、ストリーク、フィーバー状態管理
│   ├── lib/
│   │   ├── soundManager.ts # Howler.jsを用いた音響管理
│   │   └── effects.ts      # confetti・バイブレーション実行関数
│   └── types/
│       └── index.ts
├── PRD.md                  # 本仕様書
└── package.json
```

---

## 4. データ構造 (TypeScript Types)

```typescript
// src/types/index.ts

export interface UserProgress {
  totalExp: number;         // 累計EXP（原稿攻撃力）
  coins: number;            // 獲得コイン
  currentStreak: number;    // 連続達成日数
  lastActiveDate: string;   // YYYY-MM-DD
  targetPages: number;      // 目標総ページ（または総文字数）
  completedPages: number;   // 完了ページ（文字数換算）
  deadline: string;         // イベント入稿締め切り日 (YYYY-MM-DD)
}

export interface ComboState {
  comboCount: number;       // 現在のコンボ数
  isFever: boolean;         // フィーバーモード中かどうか
  feverMultiplier: number;  // 倍率 (1.0x, 1.5x, 2.0x)
  lastActionTime: number;   // 最終アクションのタイムスタンプ
}
```

---

## 5. UI/UX 仕様およびコンポーネント詳細

### 5.1 ヘッダー (`Header.tsx`)
* **表示要素:**
  * 連続日数ステッカー: `🔥 7日連続`
  * フィーバー状態バッジ: `[FEVER 2.0x]` (フィーバー時アニメーション点滅)
  * コイン所持数: `🪙 14,500`
  * BGM ON/OFF トグルスイッチ (Suno生成BGMの再生コントロール)

### 5.2 メインビジュアル演出ステージ (`VisualStage.tsx`)
* **表示要素:**
  * 画面中央のグラフィック。進捗率（`completedPages / targetPages * 100`）に応じて段階的（0%, 25%, 50%, 75%, 100%）に画像やレイヤーが変化する。
    * *例:* 0%（白紙の原稿） → 25%（下書き・枠線） → 50%（ペン入れ・アシスタント登場） → 100%（完成・入稿完了！）
  * 進捗プログレスバー＆締め切りカウントダウン表示 (`あと 14日 / 進捗 45%`)

### 5.3 アクションパネル (`ActionPanel.tsx`)
* **メインボタン 1:** `[ 🔥 1コマ描いた！ (+10,000 EXP) ]`
* **メインボタン 2:** `[ ✍️ 500文字書いた！ (+10,000 EXP) ]`
* **動作:**
  1. タップ時に `store` の `totalExp` と `coins` を加算。
  2. コンボ判定（前回のタップから15分以内ならコンボ数+1）。3コンボで `isFever = true`。
  3. `EffectOverlay` に演出トリガーを出す。

### 5.4 エフェクトオーバーレイ (`EffectOverlay.tsx`) ※最重要
ボタン押下時に1.5秒間発動するパチンコ風演出。
1. **0.0s - 0.2s (Impact):**
   * 画面全体に白いフラッシュ演出 (`animate-flash`)
   * 重厚なSE再生 (`se_impact.mp3`) + バイブレーション (`navigator.vibrate([100, 50, 100])`)
2. **0.2s - 0.8s (Number Explosion):**
   * 画面中央に大きな黄色テキストで `+10,000 EXP!` が回転縮小しながらスプラッシュ配置。
   * `canvas-confetti` で金平糖や紙吹雪・キラキラ粒子を噴射。
3. **0.8s - 1.5s (Cut-In & Combo):**
   * 横から「神作画！」「修羅場突破！」のドット絵カットイン画像がスライドイン。
   * プログレスバーが「ズズズ…ドカン！」とアニメーションしながら伸びる。

---

## 6. 音響仕様 (`soundManager.ts`)

| 種別 | ファイル名 | 再生タイミング | Suno等での作成プロンプト参考 |
|---|---|---|---|
| SE | `se_click.wav` | 通常ボタンタップ時 | - |
| SE | `se_fever_impact.wav` | 1コマ/500文字ボタン完了演出時（重低音＋キュイン音） | - |
| SE | `se_fanfare.wav` | 目標達成・レベルアップ時 | - |
| BGM | `bgm_normal.mp3` | 通常作業用 | `130 bpm, cyberpunk synthwave, driving bassline, rhythmic focus beats, instrumental` |
| BGM | `bgm_fever.mp3` | フィーバーモード突入時 | `180 bpm, hyperpop, synthwave, pachi-slot fever theme, high energy, fast arpeggiated synth` |

---

## 7. Claude Code へのプロンプト指示手順（開発ガイド）

この仕様書をプロジェクトルートに `PRD.md` として配置し、以下の順番で Claude Code へ指示を出してください。

### Step 1: プロジェクト作成とライブラリ導入
```bash
claude "Next.js (App Router, TypeScript, Tailwind CSS) のプロジェクトを作成し、framer-motion, canvas-confetti, howler, zustand, lucide-react, clsx, tailwind-merge をインストールしてください。"
```

### Step 2: データ構造とストアの実装
```bash
claude "PRD.md の内容を読み込んで、src/types/index.ts と src/store/useAppStore.ts を作成してください。データ構造とフィーバー倍率計算のロジックを含めてください。"
```

### Step 3: エフェクトとサウンドの実装
```bash
claude "PRD.md の仕様に従って、SoundManagerとEffectOverlay（canvas-confettiとframer-motionを使ったパチンコ風演出）を実装してください。"
```

### Step 4: 全体UIの組み上げ
```bash
claude "PRD.mdのUIレイアウトに基づいて src/app/page.tsx および各コンポーネント（Header, VisualStage, ActionPanel, Timer）を完成させてください。"
```