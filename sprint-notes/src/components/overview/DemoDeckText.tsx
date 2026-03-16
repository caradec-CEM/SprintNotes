import { useState, useEffect, useCallback, useRef } from 'react';
import { useSprintStore, useSelectedSprint } from '../../stores/sprintStore';
import { useNotesStore } from '../../stores/notesStore';
import { useHistoryStore } from '../../stores/historyStore';
import { TEAM_MEMBERS } from '../../config/team';
import {
  generateSlide2Summary,
  generateSlide2Metrics,
  generateSlide2Narrative,
  generateSlide3Content,
} from '../../utils/demoDeckUtils';
import type { EngineerTimeOff } from '../../types';
import './DemoDeckText.css';

type TextSource = 'ai' | 'fallback' | null;

interface SlideSection {
  label: string;
  value: string;
  loading: boolean;
  rows?: number;
  source?: TextSource;
}

export function DemoDeckText() {
  const currentSprint = useSprintStore((s) => s.currentSprint);
  const inFlightTickets = useSprintStore((s) => s.inFlightTickets);
  const selectedSprint = useSelectedSprint();
  const getSprintCapacity = useNotesStore((s) => s.getSprintCapacity);
  const getEngineerTimeOff = useNotesStore((s) => s.getEngineerTimeOff);
  const getRecentSprints = useHistoryStore((s) => s.getRecentSprints);

  const [slide2Summary, setSlide2Summary] = useState('');
  const [slide2Metrics, setSlide2Metrics] = useState('');
  const [slide2Narrative, setSlide2Narrative] = useState('');
  const [slide3Features, setSlide3Features] = useState('');
  const [slide3Fixes, setSlide3Fixes] = useState('');
  const [narrativeLoading, setNarrativeLoading] = useState(false);
  const [slide3Loading, setSlide3Loading] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [narrativeSource, setNarrativeSource] = useState<TextSource>(null);
  const [featuresSource, setFeaturesSource] = useState<TextSource>(null);
  const [fixesSource, setFixesSource] = useState<TextSource>(null);

  // Track the sprint ID so we can re-generate on sprint change
  const prevSprintId = useRef<string | null>(null);

  const sprintState = selectedSprint?.state === 'active' ? 'active' : 'closed';

  const generateLLMContent = useCallback(async () => {
    if (!currentSprint) return;

    const capacity = getSprintCapacity(currentSprint.id);
    const timeOff: Record<string, EngineerTimeOff> = {};
    for (const m of TEAM_MEMBERS) {
      timeOff[m.id] = getEngineerTimeOff(currentSprint.id, m.id);
    }
    const recentSprints = getRecentSprints(6, currentSprint.id);

    // Narrative
    setNarrativeLoading(true);
    setNarrativeSource(null);
    try {
      const narrative = await generateSlide2Narrative(
        currentSprint,
        currentSprint.tickets,
        capacity,
        timeOff,
        recentSprints
      );
      setSlide2Narrative(narrative.text);
      setNarrativeSource(narrative.source);
    } finally {
      setNarrativeLoading(false);
    }

    // Slide 3
    setSlide3Loading(true);
    setFeaturesSource(null);
    setFixesSource(null);
    try {
      const { features, fixes } = await generateSlide3Content(
        currentSprint.tickets
      );
      setSlide3Features(features.text);
      setSlide3Fixes(fixes.text);
      setFeaturesSource(features.source);
      setFixesSource(fixes.source);
    } finally {
      setSlide3Loading(false);
    }
  }, [currentSprint, getSprintCapacity, getEngineerTimeOff, getRecentSprints]);

  // Compute deterministic data immediately; fire LLM calls async
  useEffect(() => {
    if (!currentSprint) return;
    if (prevSprintId.current === currentSprint.id) return;
    prevSprintId.current = currentSprint.id;

    const recentSprints = getRecentSprints(6, currentSprint.id);

    // Deterministic
    setSlide2Summary(
      generateSlide2Summary(currentSprint.tickets, recentSprints)
    );
    setSlide2Metrics(
      generateSlide2Metrics(currentSprint.tickets, sprintState, inFlightTickets)
    );

    // Reset LLM fields before regenerating
    setSlide2Narrative('');
    setSlide3Features('');
    setSlide3Fixes('');

    // Fire LLM calls
    generateLLMContent();
  }, [currentSprint, sprintState, inFlightTickets, getRecentSprints, generateLLMContent]);

  const handleCopy = async (field: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 1500);
    } catch {
      // Clipboard API may not be available
    }
  };

  if (!currentSprint) return null;

  const sections: SlideSection[] = [
    { label: 'Slide 2 — Ticket Counts', value: slide2Summary, loading: false, rows: 2 },
    { label: 'Slide 2 — Metrics', value: slide2Metrics, loading: false, rows: 3 },
    { label: 'Slide 2 — Narrative', value: slide2Narrative, loading: narrativeLoading, rows: 3, source: narrativeSource },
    { label: 'Slide 3 — Key Features', value: slide3Features, loading: slide3Loading, rows: 6, source: featuresSource },
    { label: 'Slide 3 — Key Fixes', value: slide3Fixes, loading: slide3Loading, rows: 4, source: fixesSource },
  ];

  // Map label -> setter
  const setters: Record<string, (v: string) => void> = {
    'Slide 2 — Ticket Counts': setSlide2Summary,
    'Slide 2 — Metrics': setSlide2Metrics,
    'Slide 2 — Narrative': setSlide2Narrative,
    'Slide 3 — Key Features': setSlide3Features,
    'Slide 3 — Key Fixes': setSlide3Fixes,
  };

  const isLLMLoading = narrativeLoading || slide3Loading;

  return (
    <div className="demo-deck">
      {sections.map((s) => (
        <div key={s.label} className="demo-deck__slide">
          <div className="demo-deck__slide-header">
            <h4 className="demo-deck__slide-title">
              {s.label}
              {s.source && (
                <span className={`demo-deck__source-badge demo-deck__source-badge--${s.source}`}>
                  {s.source === 'ai' ? 'AI' : 'Fallback'}
                </span>
              )}
            </h4>
            <div className="demo-deck__actions">
              <button
                className={`demo-deck__copy-btn${copiedField === s.label ? ' demo-deck__copy-btn--copied' : ''}`}
                onClick={() => handleCopy(s.label, s.value)}
                disabled={s.loading || !s.value}
              >
                {copiedField === s.label ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>
          <textarea
            className={`demo-deck__textarea${s.loading ? ' demo-deck__textarea--loading' : ''}`}
            value={s.loading ? 'Generating...' : s.value}
            onChange={(e) => setters[s.label]?.(e.target.value)}
            rows={s.rows ?? 3}
            readOnly={s.loading}
          />
        </div>
      ))}

      <div className="demo-deck__regen-bar">
        <button
          className="demo-deck__regen-btn"
          onClick={() => {
            prevSprintId.current = null; // allow re-trigger of deterministic too
            // But mainly re-run LLM
            generateLLMContent();
          }}
          disabled={isLLMLoading}
        >
          {isLLMLoading ? 'Generating...' : 'Regenerate AI Text'}
        </button>
      </div>
    </div>
  );
}
