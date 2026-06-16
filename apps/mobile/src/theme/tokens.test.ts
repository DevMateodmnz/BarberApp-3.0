/**
 * Unit tests for the mobile design system tokens.
 *
 * Verifies the canonical token object shape, discrete exports, and
 * the public theme API re-exported from `theme/index.ts`.
 */
import { describe, it, expect } from 'vitest';
import {
  tokens,
  colors,
  typography,
  spacing,
  radius,
  shadows,
  states,
  minTouchTarget,
  createStyles,
} from '@/theme/index.js';

describe('theme tokens', () => {
  it('exports a canonical tokens object with all top-level groups', () => {
    expect(tokens).toBeDefined();
    expect(tokens.colors).toBe(colors);
    expect(tokens.typography).toBe(typography);
    expect(tokens.spacing).toBe(spacing);
    expect(tokens.radius).toBe(radius);
    expect(tokens.shadows).toBe(shadows);
    expect(tokens.states).toBe(states);
  });

  it('uses the warm dark palette for backgrounds and surfaces', () => {
    expect(colors.background).toBe('#0F0F10');
    expect(colors.surface).toBe('#1A1A1C');
    expect(colors.surfaceVariant).toBe('#232326');
    expect(colors.elevatedSurface).toBe('#2C2C2E');
  });

  it('uses readable text colors against dark surfaces', () => {
    expect(colors.textPrimary).toBe('#F5F5F5');
    expect(colors.textSecondary).toBe('#B0B0B0');
    expect(colors.textMuted).toBe('#6E6E73');
    expect(colors.textInverse).toBe('#0F0F10');
  });

  it('uses amber/copper brand colors', () => {
    expect(colors.primary).toBe('#D97706');
    expect(colors.primaryLight).toBe('#F59E0B');
    expect(colors.primaryDark).toBe('#B45309');
  });

  it('maps semantic colors correctly', () => {
    expect(colors.success).toBe('#22C55E');
    expect(colors.warning).toBe('#F59E0B');
    expect(colors.error).toBe('#EF4444');
    expect(colors.info).toBe('#3B82F6');
  });

  it('defines utility colors', () => {
    expect(colors.border).toBe('#2C2C2E');
    expect(colors.divider).toBe('#2C2C2E');
    expect(colors.overlay).toBeDefined();
    expect(colors.disabled).toBe('#6E6E73');
  });
});

describe('theme typography', () => {
  it('defines a full font-size scale', () => {
    expect(typography.size.xs).toBe(12);
    expect(typography.size.sm).toBe(14);
    expect(typography.size.base).toBe(16);
    expect(typography.size.lg).toBe(18);
    expect(typography.size.xl).toBe(20);
    expect(typography.size['2xl']).toBe(24);
    expect(typography.size['3xl']).toBe(30);
    expect(typography.size['4xl']).toBe(36);
  });

  it('defines line heights for every size', () => {
    expect(typography.lineHeight.xs).toBeDefined();
    expect(typography.lineHeight.sm).toBeDefined();
    expect(typography.lineHeight.base).toBeDefined();
    expect(typography.lineHeight.lg).toBeDefined();
    expect(typography.lineHeight.xl).toBeDefined();
    expect(typography.lineHeight['2xl']).toBeDefined();
    expect(typography.lineHeight['3xl']).toBeDefined();
    expect(typography.lineHeight['4xl']).toBeDefined();
  });

  it('maps font weights to numeric values', () => {
    expect(typography.weight.regular).toBe('400');
    expect(typography.weight.medium).toBe('500');
    expect(typography.weight.semibold).toBe('600');
    expect(typography.weight.bold).toBe('700');
  });

  it('exports named typography presets', () => {
    const presets = ['title', 'heading', 'subheading', 'body', 'bodySmall', 'caption', 'label', 'button'];
    for (const preset of presets) {
      expect(typography.variant[preset as keyof typeof typography.variant]).toBeDefined();
    }
  });
});

describe('theme spacing', () => {
  it('follows a 4px base grid', () => {
    expect(spacing[1]).toBe(4);
    expect(spacing[2]).toBe(8);
    expect(spacing[3]).toBe(12);
    expect(spacing[4]).toBe(16);
    expect(spacing[6]).toBe(24);
    expect(spacing[8]).toBe(32);
    expect(spacing[12]).toBe(48);
    expect(spacing[16]).toBe(64);
  });

  it('exports named spacing aliases', () => {
    expect(spacing.xs).toBe(4);
    expect(spacing.sm).toBe(8);
    expect(spacing.md).toBe(16);
    expect(spacing.lg).toBe(24);
    expect(spacing.xl).toBe(32);
    expect(spacing['2xl']).toBe(48);
    expect(spacing['3xl']).toBe(64);
    expect(spacing['4xl']).toBe(96);
  });
});

describe('theme radius', () => {
  it('exports a complete radius scale', () => {
    expect(radius.none).toBe(0);
    expect(radius.sm).toBe(4);
    expect(radius.md).toBe(8);
    expect(radius.lg).toBe(12);
    expect(radius.xl).toBe(16);
    expect(radius['2xl']).toBe(24);
    expect(radius.full).toBe(9999);
  });
});

describe('theme shadows', () => {
  it('exports elevation levels with iOS and Android values', () => {
    const levels: Array<keyof typeof shadows> = ['none', 'sm', 'md', 'lg', 'xl'];
    for (const level of levels) {
      const shadow = shadows[level];
      expect(shadow.shadowColor).toBeDefined();
      expect(shadow.shadowOffset).toBeDefined();
      expect(shadow.shadowOpacity).toBeDefined();
      expect(shadow.shadowRadius).toBeDefined();
      expect(shadow.elevation).toBeDefined();
    }
  });

  it('increases elevation values through the scale', () => {
    expect(shadows.sm.elevation).toBe(2);
    expect(shadows.md.elevation).toBe(4);
    expect(shadows.lg.elevation).toBe(8);
    expect(shadows.xl.elevation).toBe(12);
  });
});

describe('theme semantic states', () => {
  it('maps every appointment status to background and text colors', () => {
    const statuses: Array<keyof typeof states> = [
      'active',
      'inactive',
      'pending',
      'confirmed',
      'inProgress',
      'completed',
      'cancelled',
      'noShow',
    ];
    for (const status of statuses) {
      expect(states[status].background).toBeDefined();
      expect(states[status].text).toBeDefined();
    }
  });
});

describe('theme helpers', () => {
  it('exposes a minimum touch target constant', () => {
    expect(minTouchTarget).toBe(44);
  });

  it('exposes a typed createStyles identity helper', () => {
    const styles = createStyles({
      container: { padding: 16 },
      text: { fontSize: 14 },
    });
    expect(styles.container).toEqual({ padding: 16 });
    expect(styles.text).toEqual({ fontSize: 14 });
  });
});
