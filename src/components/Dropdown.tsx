// アイコンのみの◯トリガで開く最小のドロップダウン (DSにMenuプリミティブが無いためトークン準拠の自前)
import { useEffect, useRef, useState, type ReactNode } from "react";
import { RoundIcon } from "./ui.js";

export function Dropdown({
  icon,
  label,
  closeOnSelect,
  children,
}: {
  icon: string;
  label: string;
  /** 項目クリックで閉じる (単発選択のリスト用) */
  closeOnSelect?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [open]);
  return (
    <div className="dropdown" ref={ref}>
      <RoundIcon icon={icon} label={label} variant="outline" selected={open} onClick={() => setOpen((v) => !v)} />
      {open && (
        <div className="dropdown-pop" onClick={closeOnSelect ? () => setOpen(false) : undefined}>
          {children}
        </div>
      )}
    </div>
  );
}
