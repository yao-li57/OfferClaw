'use client';

import { useState, useRef, useCallback } from 'react';
import { Send, Paperclip, Mic, X, FileText } from 'lucide-react';

interface Props {
  onSend: (message: string) => void;
  onAttachFile: (name: string, content: string) => void;
  attachedFile: { name: string } | null;
  onClearFile: () => void;
  disabled?: boolean;
}

const AUDIO_EXTS = ['.mp3', '.wav', '.m4a', '.ogg', '.webm', '.flac'];

export function ChatInput({ onSend, disabled, onAttachFile, attachedFile, onClearFile }: Props) {
  const [input, setInput] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'transcribing'>('idle');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);

  const handleSubmit = useCallback(() => {
    if (!input.trim() || disabled) return;
    onSend(input.trim());
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  }, [input, disabled, onSend]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
  };

  const autoResizeTextarea = () => {
    if (!textareaRef.current) return;
    textareaRef.current.style.height = 'auto';
    textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + 'px';
  };

  // --- Document upload (PDF / TXT / MD) ---
  const handleDocSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setUploadStatus('uploading');
    try {
      if (file.name.toLowerCase().endsWith('.pdf')) {
        const fd = new FormData();
        fd.append('file', file);
        const res = await fetch('/api/upload', { method: 'POST', body: fd });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        onAttachFile(data.filename, data.text);
      } else {
        const text = await file.text();
        onAttachFile(file.name, text);
      }
    } catch (err) {
      alert(`文件读取失败: ${(err as Error).message}`);
    } finally {
      setUploadStatus('idle');
    }
  };

  // --- Audio file upload → transcription ---
  const handleAudioSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setUploadStatus('transcribing');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/transcribe', { method: 'POST', body: fd });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setInput(data.text);
      setTimeout(autoResizeTextarea, 0);
    } catch (err) {
      alert(`录音转文字失败: ${(err as Error).message}`);
    } finally {
      setUploadStatus('idle');
    }
  };

  // --- Live mic recording via Web Speech API ---
  const toggleRecording = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      alert('实时语音输入需要 Chrome 或 Edge 浏览器');
      return;
    }

    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
      return;
    }

    const recognition = new SR();
    recognition.lang = 'zh-CN';
    recognition.continuous = true;
    recognition.interimResults = true;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results as ArrayLike<SpeechRecognitionResult>)
        .map((r) => r[0].transcript)
        .join('');
      setInput(transcript);
      setTimeout(autoResizeTextarea, 0);
    };

    recognition.onerror = () => setIsRecording(false);
    recognition.onend = () => setIsRecording(false);
    recognitionRef.current = recognition;
    recognition.start();
    setIsRecording(true);
  };

  const busy = uploadStatus !== 'idle';

  return (
    <div className="border-t border-zinc-800 bg-surface p-4">
      {/* Attached file badge */}
      {attachedFile && (
        <div className="mx-auto max-w-3xl mb-2 flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800/60 px-3 py-1.5 text-xs text-zinc-300">
          <FileText size={13} className="text-primary shrink-0" />
          <span className="truncate flex-1">{attachedFile.name}</span>
          <button onClick={onClearFile} className="text-zinc-500 hover:text-white transition" title="移除附件">
            <X size={13} />
          </button>
        </div>
      )}

      {/* Upload status banner */}
      {busy && (
        <div className="mx-auto max-w-3xl mb-2 flex items-center gap-2 text-xs text-zinc-400 animate-pulse">
          <span>{uploadStatus === 'transcribing' ? '🎵 正在转录录音...' : '📄 正在解析文件...'}</span>
        </div>
      )}

      <div className="mx-auto flex max-w-3xl items-end gap-2">
        {/* Document upload button */}
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || busy}
          title="上传简历文档（PDF / TXT / MD）"
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition ${
            attachedFile
              ? 'border-primary text-primary'
              : 'border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200'
          } disabled:opacity-30`}
        >
          <Paperclip size={18} />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.txt,.md"
          className="hidden"
          onChange={handleDocSelect}
        />

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={input}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder={
            isRecording
              ? '正在录音，说话中...'
              : busy
              ? '处理中...'
              : '输入面试题或你的回答...'
          }
          disabled={disabled || busy}
          rows={1}
          className="flex-1 resize-none rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-zinc-100 placeholder-zinc-500 outline-none transition focus:border-primary disabled:opacity-50"
        />

        {/* Audio file upload button */}
        <button
          onClick={() => audioInputRef.current?.click()}
          disabled={disabled || busy}
          title="上传录音文件（MP3 / WAV / M4A / OGG）转文字"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200 transition disabled:opacity-30 text-base"
        >
          🎵
        </button>
        <input
          ref={audioInputRef}
          type="file"
          accept={AUDIO_EXTS.join(',')}
          className="hidden"
          onChange={handleAudioSelect}
        />

        {/* Live mic recording button */}
        <button
          onClick={toggleRecording}
          disabled={disabled || busy}
          title={isRecording ? '停止录音' : '实时语音输入（Chrome / Edge）'}
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition ${
            isRecording
              ? 'border-red-500 bg-red-500/10 text-red-400 animate-pulse'
              : 'border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200'
          } disabled:opacity-30`}
        >
          <Mic size={18} />
        </button>

        {/* Send button */}
        <button
          onClick={handleSubmit}
          disabled={disabled || !input.trim()}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-white transition hover:bg-primary-dark disabled:opacity-30"
        >
          <Send size={18} />
        </button>
      </div>
    </div>
  );
}
