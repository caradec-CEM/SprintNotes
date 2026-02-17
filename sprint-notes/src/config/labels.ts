/**
 * JIRA label categorization for CP project
 *
 * CP tickets should have at least two labels:
 * - One PRODUCT label (which product/team)
 * - One PLATFORM label (which system/tool)
 */

export type LabelCategory = 'product' | 'platform' | 'misc';

export interface LabelConfig {
  category: LabelCategory;
  displayName?: string;  // Optional: override display name
}

/**
 * Label configuration map
 */
export const LABEL_CONFIG: Record<string, LabelConfig> = {
  // Platform labels
  'Blizzard': { category: 'platform' },
  'CEMQ': { category: 'platform' },
  'Dashboard': { category: 'platform' },
  'Dashboard-V2': { category: 'platform', displayName: 'Dashboard' },  // De-duped with Dashboard
  'ITBacklog': { category: 'platform', displayName: 'IT Backlog' },
  'HubSpot': { category: 'platform' },
  'STR': { category: 'platform' },
  'Survey': { category: 'platform' },
  'Survey-V2': { category: 'platform', displayName: 'Survey' },  // De-duped with Survey
  'TemplateSafari': { category: 'platform', displayName: 'Template Safari' },
  'TemplateUploadTool': { category: 'platform', displayName: 'Template Upload Tool' },
  'Portal': { category: 'platform' },

  // Product labels
  'DC': { category: 'product' },
  'Engineering': { category: 'product' },
  'IBS': { category: 'product' },
  'Marketing': { category: 'product' },
  'PABS': { category: 'product' },

  // Misc labels
  'AI': { category: 'misc' },
  'Hotfix': { category: 'misc' },
  'Late': { category: 'misc' },
  'On-Time': { category: 'misc' },
  'Recurring': { category: 'misc' },
};

/**
 * Get label configuration, defaulting to misc if not found
 */
export function getLabelConfig(label: string): LabelConfig {
  return LABEL_CONFIG[label] || { category: 'misc' };
}

/**
 * Get display name for a label
 */
export function getLabelDisplayName(label: string): string {
  const config = getLabelConfig(label);
  return config.displayName || label;
}

/**
 * Categorize a list of labels
 */
export function categorizeLabels(labels: string[]): {
  product: string[];
  platform: string[];
  misc: string[];
} {
  const result = {
    product: [] as string[],
    platform: [] as string[],
    misc: [] as string[],
  };

  labels.forEach(label => {
    const config = getLabelConfig(label);
    result[config.category].push(label);
  });

  return result;
}

/**
 * Get primary platform label for grouping
 * Returns the display name of the first platform label, or 'Other' if none
 */
export function getPrimaryPlatform(labels: string[]): string {
  const categorized = categorizeLabels(labels);
  if (categorized.platform.length === 0) return 'Other';

  // Use the display name for grouping (this handles de-duplication)
  const firstPlatform = categorized.platform[0];
  return getLabelDisplayName(firstPlatform);
}
