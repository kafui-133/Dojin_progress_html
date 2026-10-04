import { Howl, Howler } from "howler";

export type SoundEffect = "click" | "feverImpact" | "fanfare";
export type BgmTrack = "normal" | "fever";

const SE_SOURCES: Record<SoundEffect, string> = {
  click: "/sounds/se_click.wav",
  feverImpact: "/sounds/se_fever_impact.wav",
  fanfare: "/sounds/se_fanfare.wav",
};

const BGM_SOURCES: Record<BgmTrack, string> = {
  normal: "/sounds/bgm_normal.mp3",
  fever: "/sounds/bgm_fever.mp3",
};

const SE_VOLUME = 0.8;
const BGM_VOLUME = 0.35;
const BGM_FADE_MS = 800;

/**
 * Howler.js による SE・BGM 管理。
 * 音源は初回使用時に読み込む（SSR 中や未使用時に読み込まない）。
 * ファイルが無い・読み込めない場合は何も鳴らさずに続行する。
 */
class SoundManager {
  private se = new Map<SoundEffect, Howl>();
  private bgm = new Map<BgmTrack, Howl>();
  private unavailable = new Set<string>();
  private currentBgm: BgmTrack | null = null;

  private load(src: string, options: { loop?: boolean; volume: number }): Howl | null {
    if (typeof window === "undefined" || this.unavailable.has(src)) return null;
    return new Howl({
      src: [src],
      preload: true,
      loop: options.loop ?? false,
      volume: options.volume,
      onloaderror: () => this.unavailable.add(src),
    });
  }

  private getSe(name: SoundEffect): Howl | null {
    if (!this.se.has(name)) {
      const howl = this.load(SE_SOURCES[name], { volume: SE_VOLUME });
      if (!howl) return null;
      this.se.set(name, howl);
    }
    return this.se.get(name)!;
  }

  private getBgm(track: BgmTrack): Howl | null {
    if (!this.bgm.has(track)) {
      const howl = this.load(BGM_SOURCES[track], { loop: true, volume: BGM_VOLUME });
      if (!howl) return null;
      this.bgm.set(track, howl);
    }
    return this.bgm.get(track)!;
  }

  /** 初回のユーザー操作前に呼んでおくと、最初のタップから遅延なく鳴る */
  preload(): void {
    (Object.keys(SE_SOURCES) as SoundEffect[]).forEach((name) => this.getSe(name));
  }

  play(name: SoundEffect): void {
    if (this.unavailable.has(SE_SOURCES[name])) return;
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
