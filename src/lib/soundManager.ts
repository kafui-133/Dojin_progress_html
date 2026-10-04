import { Howl, Howler } from "howler";

export type SoundEffect = "click" | "feverImpact" | "fanfare";
export type BgmTrack = "normal" | "fever";

// 先頭から順に試し、読み込めなければ次の候補を使う
const SE_SOURCES: Record<SoundEffect, string[]> = {
  click: ["/sounds/se_click.wav"],
  feverImpact: ["/sounds/se_fever_impact.wav"],
  fanfare: ["/sounds/se_fanfare.wav"],
};

// 本番の BGM（Suno 等で作った mp3）を置けばそちらを優先し、無ければ仮の wav を鳴らす
const BGM_SOURCES: Record<BgmTrack, string[]> = {
  normal: ["/sounds/bgm_normal.mp3", "/sounds/bgm_normal.wav"],
  fever: ["/sounds/bgm_fever.mp3", "/sounds/bgm_fever.wav"],
};

const SE_VOLUME = 0.8;
const BGM_VOLUME = 0.35;
const BGM_FADE_MS = 800;

/**
 * Howler.js による SE・BGM 管理。
 * 音源は初回使用時に読み込む（SSR 中や未使用時に読み込まない）。
 * 読み込めない場合は次の候補に切り替え、候補が尽きたら何も鳴らさずに続行する。
 */
class SoundManager {
  private se = new Map<SoundEffect, Howl>();
  private bgm = new Map<BgmTrack, Howl>();
  private unavailable = new Set<string>();
  private currentBgm: BgmTrack | null = null;

  private load(
    sources: string[],
    options: { loop?: boolean; volume: number },
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

  private getBgm(track: BgmTrack): Howl | null {
    if (!this.bgm.has(track)) {
      const howl = this.load(BGM_SOURCES[track], { loop: true, volume: BGM_VOLUME }, () => {
        this.bgm.delete(track);
        // 再生中の曲が読み込めなかったら次の候補で鳴らし直す
        if (this.currentBgm === track) {
          this.currentBgm = null;
          this.setBgm(track);
        }
      });
      if (!howl) return null;
      this.bgm.set(track, howl);
    }
    return this.bgm.get(track)!;
  }

  /** 初回のユーザー操作前に呼んでおくと、最初のタップから遅延なく鳴る */
  preload(): void {
    (Object.keys(SE_SOURCES) as SoundEffect[]).forEach((name) => this.getSe(name));
    (Object.keys(BGM_SOURCES) as BgmTrack[]).forEach((track) => this.getBgm(track));
  }

  play(name: SoundEffect): void {
    this.getSe(name)?.play();
  }

  /** BGM を切り替える（クロスフェード）。null で停止 */
  setBgm(track: BgmTrack | null): void {
    if (track === this.currentBgm) return;

    const prevTrack = this.currentBgm;
    const prev = prevTrack && this.bgm.get(prevTrack);
    if (prev?.playing()) {
      prev.fade(prev.volume(), 0, BGM_FADE_MS);
      // フェード中に同じ曲へ戻された場合は止めない
      prev.once("fade", () => {
        if (this.currentBgm !== prevTrack) prev.stop();
      });
    }

    this.currentBgm = track;
    if (!track) return;

    const next = this.getBgm(track);
    if (!next) return;
    next.volume(0);
    if (!next.playing()) next.play();
    next.fade(0, BGM_VOLUME, BGM_FADE_MS);
  }

  setMuted(muted: boolean): void {
    Howler.mute(muted);
  }
}

export const soundManager = new SoundManager();
