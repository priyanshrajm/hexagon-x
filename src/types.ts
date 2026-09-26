export interface RoastEntry {
  id: string;
  userSaid: string;
  roast: string;
  detectedTone: string;
  confidenceScore: number;
  subtext: string;
  actionAdvice: string;
  timestamp: string;
  audioBase64?: string | null;
}
