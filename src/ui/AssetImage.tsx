import { useState } from "react";

export function AssetImage({
  src,
  className = "",
  fallback = "",
  width,
  height,
  testId,
}: {
  src: string;
  className?: string;
  fallback?: string;
  width: number;
  height: number;
  testId?: string;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  return (
    <span
      className={`asset-image ${className}`}
      aria-hidden="true"
      data-testid={testId}
    >
      {failedSrc === src ? (
        <span className="asset-fallback">{fallback}</span>
      ) : (
        <img
          src={src}
          alt=""
          width={width}
          height={height}
          decoding="async"
          onError={() => setFailedSrc(src)}
        />
      )}
    </span>
  );
}
