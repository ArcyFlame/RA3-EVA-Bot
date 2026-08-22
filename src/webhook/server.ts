import express, { Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import xml2js from 'xml2js';
import type { Server } from 'http';
import { logger } from '../utils/logger';
import { verifyHubSignature, tokensEqual } from '../utils/hmac';
import { youTubeNotifier } from '../services/youtube-notifier.service';
import { env } from '../config/env';

const MAX_BODY_SIZE = '256kb';

export class WebhookServer {
  private app: express.Application;
  private server: Server | null = null;
  private port: number;

  constructor(port = 8081) {
    this.app = express();
    this.port = port;
    this.setupRoutes();
  }

  private setupRoutes(): void {
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 100,
      message: 'Too many requests, please try again later.',
      standardHeaders: true,
      legacyHeaders: false,
    });

    // PubSubHubbub subscription verification (GET challenge)
    this.app.get('/youtube/callback', limiter, (req: Request, res: Response) => {
      const challenge = req.query['hub.challenge'];
      const verifyToken = req.query['hub.verify_token'];

      // Fail closed: without a configured token the endpoint refuses all
      // verifications instead of falling back to a guessable constant.
      if (!env.YOUTUBE_VERIFY_TOKEN) {
        logger.error('YOUTUBE_VERIFY_TOKEN is not configured - rejecting verification request');
        res.status(500).send('Server misconfigured');
        return;
      }
      if (typeof verifyToken !== 'string' || !tokensEqual(verifyToken, env.YOUTUBE_VERIFY_TOKEN)) {
        logger.warn('YouTube verification token mismatch');
        res.status(404).send('Invalid token');
        return;
      }
      if (typeof challenge !== 'string' || challenge.length > 512) {
        res.status(400).send('Invalid challenge');
        return;
      }
      logger.info('YouTube subscription verified');
      res.type('text/plain').send(challenge);
    });

    // PubSubHubbub content distribution (POST Atom feed)
    this.app.post(
      '/youtube/callback',
      limiter,
      express.text({
        type: ['application/atom+xml', 'application/xml', 'text/xml'],
        limit: MAX_BODY_SIZE,
      }),
      async (req: Request, res: Response) => {
        const body = req.body;
        if (!body || typeof body !== 'string') {
          res.status(400).send('No body');
          return;
        }

        // Fail closed: without a shared secret the endpoint cannot authenticate
        // the sender, so reject all POSTs (mirrors the verify-token pattern).
        if (!env.YOUTUBE_CALLBACK_SECRET) {
          logger.error('YOUTUBE_CALLBACK_SECRET not configured - rejecting notification');
          res.status(500).send('Server misconfigured');
          return;
        }
        const signature = req.header('X-Hub-Signature');
        if (!signature || !verifyHubSignature(signature, body, env.YOUTUBE_CALLBACK_SECRET)) {
          logger.warn('YouTube notification with invalid X-Hub-Signature rejected');
          res.status(403).send('Invalid signature');
          return;
        }

        try {
          const parser = new xml2js.Parser({ explicitArray: false });
          const result = await parser.parseStringPromise(body);
          const entry = result.feed?.entry;
          if (!entry) {
            res.status(200).send('OK');
            return;
          }

          const videoId = typeof entry['yt:videoId'] === 'string' ? entry['yt:videoId'] : null;
          const channelId =
            typeof entry['yt:channelId'] === 'string' ? entry['yt:channelId'] : null;
          const title = typeof entry.title === 'string' ? entry.title.slice(0, 500) : '';
          const isLive = !!entry['yt:liveBroadcast'];

          if (!videoId || !channelId) {
            logger.warn('YouTube notification missing videoId or channelId');
            res.status(200).send('OK');
            return;
          }

          // Acknowledge first, process after — slow Discord sends must not
          // cause PubSubHubbub to retry and duplicate the notification.
          res.status(200).send('OK');
          youTubeNotifier
            .handleNotification(channelId, videoId, title, isLive)
            .catch((error) => logger.error('YouTube notification handling failed:', error));
        } catch (error) {
          logger.error('YouTube notification parsing error:', error);
          res.status(400).send('Malformed payload');
        }
      },
    );

    this.app.get('/health', (_req: Request, res: Response) => {
      res.status(200).send('OK');
    });
  }

  start(): void {
    this.server = this.app.listen(this.port, () => {
      logger.info(`Webhook server listening on port ${this.port}`);
    });
    // An 'error' event (EADDRINUSE/EACCES) is emitted asynchronously and, with
    // no listener, would surface as an uncaught exception and crash the bot.
    this.server.on('error', (error) => {
      logger.error(`Webhook server failed to listen on port ${this.port}:`, error);
    });
  }

  stop(): void {
    if (this.server) {
      this.server.close(() => logger.info('Webhook server stopped'));
      this.server = null;
    }
  }
}
