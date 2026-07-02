import { useState } from 'react';
import './Avatar.css';

interface AvatarProps {
  name: string;
  src?: string;
  /** Sizing/shape class from the host context (sets width/height/border-radius). */
  className?: string;
}

// Small palette derived from the brand colors — deterministic per name.
const FALLBACK_COLORS = [
  '#4A75A3', // Insight Blue
  '#56878a', // Teal
  '#7a6392', // Violet
  '#C8841A', // Scatter Gold
  '#6BB8D9', // Community Cyan
  '#98cec2', // Mint
];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function colorFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return FALLBACK_COLORS[hash % FALLBACK_COLORS.length];
}

/**
 * Avatar that shows the JIRA picture when available, otherwise a colored
 * circle with the member's initials. Pass the host's sizing class via
 * className so both the image and the fallback share the same dimensions.
 */
export function Avatar({ name, src, className }: AvatarProps) {
  const [failed, setFailed] = useState(false);

  if (src && !failed) {
    return (
      <img
        src={src}
        alt=""
        className={className}
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <span
      className={`avatar-fallback ${className ?? ''}`}
      style={{ backgroundColor: colorFor(name) }}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}
