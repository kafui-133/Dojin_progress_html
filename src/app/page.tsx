import DebugPanel from "@/components/DebugPanel";
import EffectOverlay from "@/components/EffectOverlay";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col bg-zinc-950">
      <DebugPanel />
      <EffectOverlay />
    </div>
  );
}
