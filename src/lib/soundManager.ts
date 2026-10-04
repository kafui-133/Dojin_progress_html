import { Howl, Howler } from "howler";

export type SoundEffect = "click" | "feverImpact" | "fanfare" | "stroke" | "undo";

// 先頭から順に試し、読み込めなければ次の候補を使う
const SE_SOURCES: Record<SoundEffect, string[]> = {
  click: ["/sounds/se_click.wav"],
  feverImpact: ["/sounds/se_fever_impact.wav"],
  fanfare: ["/sounds/se_fanfare.wav"],
  stroke: ["/sounds/se_stroke.wav"],
  undo: ["/sounds/se_undo.wav"],
};

export interface BgmPreset {
  id: string;
  label: string;
  description: string;
  sources: string[];
}

/**
 * 内蔵 BGM（scripts/generate-sounds.mjs で作った仮の曲）。
 * 同じ名前の mp3 を public/sounds/ に置けばそちらを優先する。
 */
export const BGM_PRESETS: BgmPreset[] = [
  {
    id: "synthwave",
    label: "シンセウェーブ",
    description: "130bpm・作業向けのドライブ感",
    sources: ["/sounds/bgm_normal.mp3", "/sounds/bgm_normal.wav"],
  },
  {
    id: "hyperpop",
    label: "ハイパーポップ",
    description: "180bpm・パチスロのフィーバー風",
    sources: ["/sounds/bgm_fever.mp3", "/sounds/bgm_fever.wav"],
  },
  {
    id: "lofi",
    label: "Lo-fi チル",
    description: "80bpm・落ち着いて線を引きたいとき",
    sources: ["/sounds/bgm_lofi.mp3", "/sounds/bgm_lofi.wav"],
  },
  {
    id: "chiptune",
    label: "8bit チップチューン",
    description: "150bpm・レトロゲーム風",
    sources: ["/sounds/bgm_chiptune.mp3", "/sounds/bgm_chiptune.wav"],
  },
  {
    id: "eurobeat",
    label: "ユーロビート",
    description: "160bpm・修羅場を駆け抜ける",
    sources: ["/sounds/bgm_eurobeat.mp3", "/sounds/bgm_eurobeat.wav"],
  },
];

export const DEFAULT_BGM_NORMAL = "synthwave";
export const DEFAULT_BGM_FEVER = "hyperpop";

const SE_VOLUME = 0.8;
const STROKE_VOLUME = 0.45;
/** 線の効果音の音階（メジャーペンタトニック、半音単位） */
const PENTATONIC = [0, 2, 4, 7, 9];
/** 2オクターブ上まで上がったら折り返す */
const STROKE_NOTES = 11;
const BGM_VOLUME = 0.35;
/** 声の読み上げ中は BGM をこの割合まで下げる */
const DUCK_RATIO = 0.3;
const BGM_FADE_MS = 800;
const PREVIEW_MS = 8000;

interface BgmSource {
  sources: string[];
  /** 拡張子のない URL（自分で追加した曲の blob: URL）のときに必要 */
  format?: string;
}

/**
 * Howler.js による SE・BGM 管理。
 * 音源は初回使用時に読み込む（SSR 中や未使用時に読み込まない）。
 * 読み込めない場合は次の候補に切り替え、候補が尽きたら何も鳴らさずに続行する。
 */
class SoundManager {
  private se = new Map<SoundEffect, Howl>();
  private bgm = new Map<string, Howl>();
  private bgmSources = new Map<string, BgmSource>(
    BGM_PRESETS.map((preset) => [preset.id, { sources: preset.sources }]),
  );
  private unavailable = new Set<string>();
  private currentBgm: string | null = null;
  private previewing: string | null = null;
  private previewTimer: ReturnType<typeof setTimeout> | undefined;
  private ducked = false;

  private load(
    sources: string[],
    options: { loop?: boolean; volume: number; format?: string },
    onFallback: () => void,
  ): Howl | null {
    if (typeof window === "undefined") return null;
    const src = sources.find((s) => !this.unavailable.has(s));
    if (!src) return null;
    const howl: Howl = new Howl({
      src: [src],
      preload: true,
      loop: options.loop ?? false,
      volume: options.volume,
      ...(options.format && { format: [options.format] }),
      onloaderror: () => {
        this.unavailable.add(src);
        howl.unload();
        onFallback();
      },
    });
    return howl;
  }

  private getSe(name: SoundEffect): Howl | null {
    if (!this.se.has(name)) {
      const howl = this.load(SE_SOURCES[name], { volume: SE_VOLUME }, () => this.se.delete(name));
      if (!howl) return null;
      this.se.set(name, howl);
    }
    return this.se.get(name)!;
  }

  private getBgm(id: string): Howl | null {
    if (!this.bgm.has(id)) {
      const source = this.bgmSources.get(id);
      if (!source) return null;
      const howl = this.load(
        source.sources,
        { loop: true, volume: BGM_VOLUME, format: source.format },
        () => {
          this.bgm.delete(id);
          // 再生中の曲が読み込めなかったら次の候補で鳴らし直す
          if (this.currentBgm === id) {
            this.currentBgm = null;
            this.setBgm(id);
          }
        },
      );
      if (!howl) return null;
      this.bgm.set(id, howl);
    }
    return this.bgm.get(id)!;
  }

  private targetVolume(): number {
    return this.ducked ? BGM_VOLUME * DUCK_RATIO : BGM_VOLUME;
  }

  private fadeOutAndStop(id: string): void {
    const howl = this.bgm.get(id);
    if (!howl?.playing()) return;
    howl.fade(howl.volume(), 0, BGM_FADE_MS);
    // フェード中に同じ曲へ戻された場合は止めない
    howl.once("fade", () => {
      if (this.currentBgm !== id && this.previewing !== id) howl.stop();
    });
  }

  private fadeIn(id: string): void {
    const howl = this.getBgm(id);
    if (!howl) return;
    if (!howl.playing()) {
      howl.volume(0);
      howl.play();
    }
    howl.fade(howl.volume(), this.targetVolume(), BGM_FADE_MS);
  }

  /** 初回のユーザー操作前に呼んでおくと、最初のタップから遅延なく鳴る */
  preload(bgmIds: string[] = []): void {
    (Object.keys(SE_SOURCES) as SoundEffect[]).forEach((name) => this.getSe(name));
    bgmIds.forEach((id) => this.getBgm(id));
  }

  play(name: SoundEffect): void {
    this.getSe(name)?.play();
  }

  /**
   * 線の効果音。続けて引くほど音階が上がり、2オクターブ上で折り返す。
   * @param step 何本目の線か（1始まり）
   */
  playStroke(step: number): void {
    const howl = this.getSe("stroke");
    if (!howl) return;
    const cycle = STROKE_NOTES * 2 - 2;
    const i = (step - 1) % cycle;
    const note = i < STROKE_NOTES ? i : cycle - i;
    const semitones = 12 * Math.floor(note / PENTATONIC.length) + PENTATONIC[note % PENTATONIC.length];
    const id = howl.play();
    howl.rate(Math.pow(2, semitones / 12), id);
    howl.volume(STROKE_VOLUME, id);
  }

  /** ブラウザの自動再生制限で音が止められているか */
  isLocked(): boolean {
    return Howler.ctx?.state === "suspended";
  }

  async unlock(): Promise<void> {
    await Howler.ctx?.resume();
  }

  /** 自分で追加した曲を使えるようにする */
  registerTrack(id: string, url: string, format: string): void {
    this.bgmSources.set(id, { sources: [url], format });
    // 読み込みより先に選ばれていた曲なら、ここで鳴らし始める
    if (this.currentBgm === id) this.fadeIn(id);
  }

  unregisterTrack(id: string): void {
    this.bgm.get(id)?.unload();
    this.bgm.delete(id);
    this.bgmSources.delete(id);
    if (this.currentBgm === id) this.currentBgm = null;
  }

  /** BGM を切り替える（クロスフェード）。null で停止 */
  setBgm(id: string | null): void {
    if (id === this.currentBgm) return;
    const prev = this.currentBgm;
    this.currentBgm = id;
    if (prev) this.fadeOutAndStop(prev);
    if (id) this.fadeIn(id);
  }

  /** 設定画面での試聴。数秒流して止める（作業中の BGM には影響しない） */
  preview(id: string): void {
    if (this.previewing && this.previewing !== id) this.fadeOutAndStop(this.previewing);
    clearTimeout(this.previewTimer);
    this.previewing = id;
    this.fadeIn(id);
    this.previewTimer = setTimeout(() => {
      this.previewing = null;
      if (this.currentBgm !== id) this.fadeOutAndStop(id);
    }, PREVIEW_MS);
  }

  /** 声の読み上げ中は BGM を下げる */
  duck(on: boolean): void {
    if (this.ducked === on) return;
    this.ducked = on;
    const howl = this.currentBgm ? this.bgm.get(this.currentBgm) : undefined;
    if (howl?.playing()) howl.fade(howl.volume(), this.targetVolume(), 250);
  }

  setMuted(muted: boolean): void {
    Howler.mute(muted);
  }
}

export const soundManager = new SoundManager();
