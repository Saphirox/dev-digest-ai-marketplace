import { useState, type ReactNode } from 'react';
import type { ArtifactType } from '../types';

const TYPE_LABEL: Record<ArtifactType, string> = {
  skill: 'Skill',
  agent: 'Agent',
  command: 'Command',
  hook: 'Hook',
  mcp: 'MCP',
  plugin: 'Plugin',
};

export function typeLabel(type: ArtifactType, plural = false): string {
  if (!plural) return TYPE_LABEL[type];
  return type === 'mcp' ? 'MCP servers' : `${TYPE_LABEL[type]}s`;
}

export function TypeBadge({ type }: { type: ArtifactType }) {
  return <span className={`badge badge-${type}`}>{TYPE_LABEL[type]}</span>;
}

function Svg({ children, size = 18 }: { children: ReactNode; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

export const Icon = {
  logo: () => (
    <Svg size={22}>
      <path d="M4 17l6-5-6-5" />
      <path d="M12 19h8" />
    </Svg>
  ),
  search: () => (
    <Svg size={22}>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-4-4" />
    </Svg>
  ),
  copy: () => (
    <Svg>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h10" />
    </Svg>
  ),
  check: () => (
    <Svg>
      <path d="M5 12l5 5 9-10" />
    </Svg>
  ),
  download: () => (
    <Svg>
      <path d="M12 3v12" />
      <path d="M7 10l5 5 5-5" />
      <path d="M5 21h14" />
    </Svg>
  ),
  sparkle: () => (
    <Svg size={20}>
      <path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" />
      <path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" />
    </Svg>
  ),
  close: () => (
    <Svg>
      <path d="M6 6l12 12" />
      <path d="M18 6L6 18" />
    </Svg>
  ),
};

async function writeClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function CopyButton({ text, label = 'Copy', showText = false, className = '' }: { text: string; label?: string; showText?: boolean; className?: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const onClick = async () => {
    setState((await writeClipboard(text)) ? 'copied' : 'failed');
    window.setTimeout(() => setState('idle'), 1600);
  };
  const status = state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed' : label;
  return (
    <button type="button" className={`copy-btn ${showText ? 'copy-btn-text' : ''} ${className}`} onClick={onClick} aria-label={showText ? undefined : status} title={status}>
      {state === 'copied' ? <Icon.check /> : <Icon.copy />}
      {showText && <span>{status}</span>}
      <span className="sr-only" aria-live="polite">{state !== 'idle' ? status : ''}</span>
    </button>
  );
}

export function CodeLine({ text, dark = false, label }: { text: string; dark?: boolean; label?: string }) {
  return (
    <div className={`code-line ${dark ? 'code-line-dark' : ''}`}>
      <code>{text}</code>
      <CopyButton text={text} label={label ?? 'Copy command'} />
    </div>
  );
}
