import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary'],
      // Focus coverage on the new, testable logic modules + the feature
      // surfaces (API clients, hooks, pages, cards) added in this round.
      include: [
        // pure logic / shared utils
        'src/shared/utils/dates.ts',
        'src/features/projects/components/mention.ts',
        'src/features/projects/components/boardConstants.ts',
        'src/features/qa/components/qaConstants.ts',
        'src/features/quicktasks/components/attachments.ts',
        'src/features/projects/hooks/applyOptimisticMove.ts',
        // API clients
        'src/features/projects/api/activity.ts',
        'src/features/projects/api/projects.ts',
        'src/features/quicktasks/api/quicktasks.ts',
        'src/features/qa/api/bugReports.ts',
        'src/features/reports/api/reports.ts',
        'src/features/stats/api/metrics.ts',
        'src/features/verify/api/verify.ts',
        'src/features/viewaccount/api/viewaccount.ts',
        // hooks
        'src/features/projects/hooks/useProjects.ts',
        'src/features/quicktasks/hooks/useQuickTasks.ts',
        // components / pages
        'src/features/projects/components/PerformancePanel.tsx',
        'src/features/stats/components/PersonalStatsCard.tsx',
        'src/features/stats/components/TeamStatsCard.tsx',
        'src/features/verify/pages/VerifyPage.tsx',
      ],
      thresholds: {
        lines: 85,
        statements: 85,
        functions: 85,
        branches: 80,
      },
    },
  },
});
