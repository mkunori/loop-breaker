import { useEffect, useRef, useState } from "react";
import { VISUAL } from "../config/visual";

// Observe a genuine command notification; loading/importing a Save never celebrates.
export function MasteryCelebration({
  count,
  message,
}: {
  count: number;
  message: string;
}) {
  const previous = useRef(count),
    [earned, setEarned] = useState<number | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const banner = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (earned !== null)
      banner.current?.scrollIntoView({ block: "start", behavior: "auto" });
  }, [earned]);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  useEffect(() => {
    const acquired =
      count === previous.current + 1 &&
      count <= 2 &&
      message.startsWith("LOOP MASTERY / BREAK");
    previous.current = count;
    if (!acquired) return;
    setEarned(count);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(
      () => setEarned(null),
      VISUAL.masteryNoticeMs,
    );
  }, [count, message]);
  if (earned === null) return null;
  return (
    <div
      ref={banner}
      className="mastery-celebration"
      role="status"
      data-testid="mastery-celebration"
    >
      <span className="mastery-emblem" aria-hidden="true" />
      <div>
        <small>LOOP MASTERY 獲得</small>
        <strong>BREAK {earned === 1 ? "I" : "II"}</strong>
        <span>周回そのものを圧縮しました</span>
      </div>
      <button
        type="button"
        onClick={() => setEarned(null)}
        aria-label="獲得演出を閉じる"
      >
        ×
      </button>
    </div>
  );
}
