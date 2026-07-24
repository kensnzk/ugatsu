// ◯の中にアイコンだけの最小ボタン — トップナビ・パネル開閉・キャンバス隅のトリガ用
import { IconButton } from "../lib/ds.js";

export function RoundIcon({
  icon,
  label,
  variant = "ghost",
  selected,
  disabled,
  onClick,
}: {
  icon: string;
  label: string;
  variant?: "ghost" | "outline";
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <IconButton
      icon={icon}
      label={label}
      size="sm"
      variant={variant}
      selected={selected}
      disabled={disabled}
      onClick={onClick}
      style={{ borderRadius: "var(--radius-full)" }}
    />
  );
}
