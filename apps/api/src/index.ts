/**
 * BarberApp API - Entry Point
 */
import express from 'express';
import cors from 'cors';
import { errorHandler } from './middleware/errorHandler.js';
import { appointmentRateLimit } from './middleware/rateLimit.js';
import appointmentRoutes from './routes/appointments.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy for correct client IP detection behind reverse proxy (nginx, ALB, etc.)
// Uncomment and configure when deploying behind a proxy:
//   app.set('trust proxy', 1);
//   app.set('trust proxy', ['loopback', 'linklocal', 'uniquelocal']);

// Global middleware
app.use(cors({ origin: process.env.ALLOWED_ORIGIN || '*', credentials: true }));
app.use(express.json());

// Health check (no auth required)
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Placeholder route for testing
app.get('/api/v1/ping', (_req, res) => {
  res.json({ success: true, data: { message: 'pong' } });
});

// API routes
app.use('/api/v1/appointments', appointmentRateLimit, appointmentRoutes);

// Global error handler (must be last)
app.use(errorHandler);

export { app };

// Only start server if run directly (not imported for testing)
if (process.argv[1]?.includes('index.ts')) {
  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`BarberApp API running on port ${PORT}`);
  });
}
