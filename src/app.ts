import express from 'express';
import cors from 'cors';
import { errorHandler } from './middlewares/error.js';
import { router as apiRouter } from './routes/index.js';

const app = express();

app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Fabrica API is running',
    timestamp: new Date()
  });
});

// API Routes
app.use('/api', apiRouter);

// Global Error Handler
app.use(errorHandler);

export default app;
