import type { ReactNode } from "react";

interface SettingsSectionProps {
  title: string;
  description?: string;
  children: ReactNode;
}

export function SettingsSection({ title, description, children }: SettingsSectionProps) {
  return (
    <section className="overflow-hidden rounded-xl border border-lines bg-panel">
      <header className="border-b border-lines px-4 py-[14px]">
        <div className="font-sans text-[13px] leading-[1.3] font-semibold">{title}</div>
        {description && (
          <div className="mt-[2px] font-sans text-[11.5px] leading-[1.5] font-normal text-fg3">
            {description}
          </div>
        )}
      </header>
      {children}
    </section>
  );
}
