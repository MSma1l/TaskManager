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
      // Focus coverage on the new, testable logic modules.
      include: [
        'src/shared/utils/dates.ts',
        'src/features/projects/components/mention.ts',
        'src/features/projects/components/boardConstants.ts',
        'src/features/projects/hooks/applyOptimisticMove.ts',
        'src/features/projects/components/PerformancePanel.tsx',
      ],
    },
  },
});
