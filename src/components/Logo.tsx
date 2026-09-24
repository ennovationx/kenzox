import logo from "@/assets/kenzo-logo.png";

export function Logo({ size = 32, showWordmark = true }: { size?: number; showWordmark?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 select-none">
      <img
        src={logo}
        alt="Kenzo"
        width={size}
        height={size}
        style={{ width: size, height: size }}
        className="rounded-lg"
      />
      {showWordmark && (
        <span className="hidden sm:inline font-semibold tracking-tight text-foreground text-lg">Kenzo</span>
      )}
    </span>
  );
}
