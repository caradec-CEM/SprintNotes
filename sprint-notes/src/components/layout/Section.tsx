import { useState, type ReactNode } from 'react';
import './Section.css';

interface SectionProps {
  title: string;
  defaultCollapsed?: boolean;
  children: ReactNode;
  actions?: ReactNode;
}

export function Section({
  title,
  defaultCollapsed = false,
  children,
  actions,
}: SectionProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  return (
    <section className={`section ${collapsed ? 'section--collapsed' : ''}`}>
      <header className="section__header">
        <button
          className="section__toggle no-print"
          onClick={() => setCollapsed(!collapsed)}
          aria-expanded={!collapsed}
        >
          <span className="section__toggle-icon">{collapsed ? '▶' : '▼'}</span>
          <h3 className="section__title">{title}</h3>
        </button>

        {actions && <div className="section__actions no-print">{actions}</div>}
      </header>

      {!collapsed && <div className="section__content">{children}</div>}
    </section>
  );
}
