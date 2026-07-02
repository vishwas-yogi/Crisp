export type ToneConfig = {
  description: string;
  hint: string;
};

export type Config = {
  general: {
    mode: 'auto' | 'confirm';
    default_tone: string;
    hotkey: string;
    preserve_tone: boolean;
  };
  model: {
    name: string;
    ollama_url: string;
    keepalive: string;
  };
  tones: Record<string, ToneConfig>;
};

export type UndoEntry = {
  original: string;
  app: string;
  timestamp: number;
};

export type LuaRunner = {
  onBeforeRewrite(text: string, appName: string, tone: string): Promise<[string, string]>;
  onAfterRewrite(original: string, rewritten: string, appName: string): Promise<string>;
};
