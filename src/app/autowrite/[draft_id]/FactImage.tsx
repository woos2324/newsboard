"use client";

interface FactImageProps {
  src: string;
}

export function FactImage({ src }: FactImageProps) {
  const proxied = `/api/proxy-image?url=${encodeURIComponent(src)}`;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={proxied}
      alt="참고 이미지"
      className="w-full rounded border border-border object-cover"
      style={{ maxHeight: 160 }}
      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
    />
  );
}
