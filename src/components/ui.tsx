// トップナビ・パネル開閉・キャンバス隅で使う最小のアイコンボタン。
// edge と選択表現は DS 側へ委ねる。
import { IconButton } from "../lib/ds.js";

export function ToolIcon({
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
    />
  );
}
