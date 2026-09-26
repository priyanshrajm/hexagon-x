import express, { Request, Response } from 'express';
import http from 'http';
import path from 'path';
import { WebSocketServer, WebSocket } from 'ws';
import { GoogleGenAI, Modality } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '50mb' }));

const apiKey = process.env.GEMINI_API_KEY || '';
const ai = new GoogleGenAI({
  apiKey,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

// Health check
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    hasApiKey: Boolean(apiKey),
    timestamp: new Date().toISOString(),
  });
});

const LIVE_SAVAGE_INSTRUCTION = `You are the ultimate Real-Time Savage Roast AI with Strict Single-Speaker Lock.

PRIMARY SPEAKER LOCK & INTERFERENCE CONTROL:
1. FOCUS ON THE ORIGINAL SPEAKER & EXACT TOPIC:
   - Listen carefully to the exact subject/topic the original speaker brings up.
   - Roast their EXACT topic with pinpoint surgical precision.

2. SHUT DOWN ANY SECONDARY / INTERRUPTING SPEAKER IMMEDIATELY:
   - If a second person cuts in, whispers in the background, or another voice speaks, SHUT THEM DOWN IMMEDIATELY!
   - Tell them directly to back off:
     * "Don't talk other speaker, first I will deal with this loser!"
     * "Hey other speaker shut up, first I will deal with this loser!"
     * "ओए दूसरे बंदे, बीच में मत बोल! पहले मैं इस नमूने से निपट लूँ!"
     * "Quiet in the back! First I'll finish roasting this loser!"

3. MAXIMUM SAVAGE ROAST (NO MERCY):
   - Hit them where it hurts: their voice, their excuses, their procrastination, their exact topic.
   - Sarcastic, razor-sharp, brutal best friend energy.

4. COMPLETE FULL FINISH (NEVER STOP HALFWAY):
   - Always finish your full sentence completely.
   - Deliver 1 concise, complete punchline (MAX 10 to 14 WORDS).

5. SEAMLESS MULTILINGUAL:
   - If user speaks Hindi: Roast in Hindi!
   - If Hinglish: Roast in Hinglish!
   - If English: Roast in English!`;

/**
 * Rapid HTTP Roast Endpoint (Fallback & One-Click Starters)
 */
app.post('/api/live-roast-pulse', async (req: Request, res: Response) => {
  try {
    const { message, voice = 'Puck', isSecondarySpeakerDetected = false } = req.body;
    const targetStatement = (message || 'User spoke').trim();

    const isSecondary =
      isSecondarySpeakerDetected ||
      /other speaker|let me speak|listen to me|shut up|me too|wait me/i.test(targetStatement);

    const response = await ai.models.generateContent({
      model: 'gemini-flash-latest',
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `${LIVE_SAVAGE_INSTRUCTION}

USER STATEMENT: "${targetStatement}"
IS SECONDARY SPEAKER TRYING TO INTERRUPT: ${isSecondary ? 'YES - MUST FIRE SHUTDOWN LINE' : 'NO - ROAST THE EXACT TOPIC'}

If secondary speaker is interrupting, respond with:
"Don't talk other speaker, first I will deal with this loser!" (or Hindi equivalent if in Hindi).
Otherwise, deliver a savage roast addressing their EXACT topic.

Return valid JSON with keys:
{
  "detectedTone": "Interrupted" | "Defensive" | "Hesitant" | "Coping",
  "confidenceScore": 99,
  "roast": "Brutal roast or secondary speaker shutdown (MAX 10-12 WORDS)",
  "subtext": "Observation of their topic or interruption",
  "actionAdvice": "Short 3-word tip"
}`,
            },
          ],
        },
      ],
      config: {
        responseMimeType: 'application/json',
        maxOutputTokens: 350,
      },
    });

    let parsed: any = {};
    try {
      parsed = JSON.parse(response.text || '{}');
    } catch (parseError) {
      console.warn('JSON parse fallback:', parseError);
    }

    if (!parsed.roast) {
      if (isSecondary) {
        parsed = {
          detectedTone: 'Interrupted',
          confidenceScore: 99,
          roast: "Don't talk other speaker, first I will deal with this loser!",
          subtext: 'Secondary interference neutralized',
          actionAdvice: 'Wait your turn'
        };
      } else {
        parsed = {
          detectedTone: 'Coping',
          confidenceScore: 96,
          roast: 'Your topic makes even less sense than your schedule.',
          subtext: 'Topic dissected',
          actionAdvice: 'Make better choices'
        };
      }
    }

    const roastText = parsed.roast;

    // Instant voice audio synthesis
    let audioOutputBase64: string | null = null;
    try {
      const speechRes = await ai.models.generateContent({
        model: 'gemini-3.8-flash-lite-tts',
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: roastText,
                speechMetadata: {
                  style: 'Brutal, dismissive, sharp witty aggressive comedic friend',
                },
              },
            ],
          },
        ],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: voice as any } },
          },
        },
      });

      audioOutputBase64 = speechRes.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || null;
    } catch (speechErr) {
      console.warn('Fast TTS warning:', speechErr);
    }

    res.json({
      ...parsed,
      audioBase64: audioOutputBase64,
    });
  } catch (err: any) {
    console.error('Fast roast error:', err);
    res.status(500).json({
      detectedTone: 'Interrupted',
      confidenceScore: 95,
      roast: "Don't talk other speaker, first I will deal with this loser!",
      subtext: 'Secondary voice shut down',
      actionAdvice: 'Wait your turn',
      audioBase64: null,
    });
  }
});

// Full-Duplex Real-Time Gemini Live Audio WebSocket
const wss = new WebSocketServer({ server, path: '/live' });

wss.on('connection', async (clientWs: WebSocket, req: http.IncomingMessage) => {
  console.log('[Live Fast Roast] Client connected to Live WebSocket');

  if (!apiKey) {
    clientWs.send(JSON.stringify({ type: 'error', message: 'API Key not set' }));
    clientWs.close();
    return;
  }

  const urlObj = new URL(req.url || '', 'http://localhost');
  const voiceParam = urlObj.searchParams.get('voice') || 'Puck';

  let session: any = null;
  let isClosing = false;

  try {
    session = await ai.live.connect({
      model: 'gemini-3.8-live',
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: voiceParam as any } },
        },
        systemInstruction: `${LIVE_SAVAGE_INSTRUCTION}

REAL-TIME LIVE BEHAVIOR:
1. Address the primary user's EXACT words and topic.
2. If another speaker enters the audio feed or speaks in the background, shut them down immediately:
   "Don't talk other speaker, first I will deal with this loser!"
3. Keep spoken replies to 1 complete, punchy sentence (8-12 words).
4. Always finish your dialogue completely.`,
      },
      callbacks: {
        onmessage: (message: any) => {
          if (isClosing) return;

          const parts = message.serverContent?.modelTurn?.parts;
          if (parts && parts.length > 0) {
            for (const part of parts) {
              if (part.inlineData?.data) {
                clientWs.send(JSON.stringify({ type: 'audio', audio: part.inlineData.data }));
              }
              if (part.text) {
                clientWs.send(JSON.stringify({ type: 'transcript', text: part.text }));
              }
            }
          }

          if (message.serverContent?.interrupted) {
            // Note: client controls interrupt policy to prevent premature truncation
            clientWs.send(JSON.stringify({ type: 'model_interrupted' }));
          }

          if (message.serverContent?.turnComplete) {
            clientWs.send(JSON.stringify({ type: 'turn_complete' }));
          }
        },
        onerror: (err: any) => {
          console.error('[Live Roast] Error:', err);
          if (!isClosing && clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(JSON.stringify({ type: 'error', message: err?.message || 'Error' }));
          }
        },
        onclose: () => {
          if (!isClosing && clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(JSON.stringify({ type: 'session_closed' }));
          }
        },
      },
    });

    clientWs.send(JSON.stringify({ type: 'ready' }));
  } catch (err: any) {
    console.error('[Live Roast] Setup error:', err);
    clientWs.send(JSON.stringify({ type: 'error', message: err.message }));
    clientWs.close();
    return;
  }

  clientWs.on('message', (raw: any) => {
    try {
      const data = JSON.parse(raw.toString());
      if (data.type === 'audio' && data.audio) {
        if (session) {
          session.sendRealtimeInput({
            audio: { data: data.audio, mimeType: 'audio/pcm;rate=16000' },
          });
        }
      } else if (data.type === 'text' && data.text) {
        if (session) {
          session.send({
            clientContent: {
              turns: [{ role: 'user', parts: [{ text: data.text }] }],
              turnComplete: true,
            },
          });
        }
      }
    } catch (parseErr) {
      console.error('[Live Roast] Parse error:', parseErr);
    }
  });

  clientWs.on('close', () => {
    isClosing = true;
    if (session) {
      try {
        session.close();
      } catch (e) {
        // ignore
      }
    }
  });
});

// Setup Vite middleware in dev or serve dist in production
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, () => {
    console.log(`[Instant Savage Roast AI] Server running on http://localhost:${PORT}`);
  });
}

startServer();
