import {
  ArrowLeft, ArrowUp, Check, ChevronDown, ChevronRight, Eye, Folder,
  LoaderCircle, ShieldAlert, ShieldCheck, Square, X, Plus, Mic, FileImage, MessageSquare
} from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { permissionLabel, type PermissionProfile } from '../../shared/permissions';
import type { ComposerAttachment, ContextUsage, ModelInfo, ProjectInfo } from '../types';
import { modelDisplayName, reasoningLabel, reasoningOptionsForModel } from '../workspace-model';

interface ComposerProps {
  variant: 'home' | 'thread';
  layout: 'desktop' | 'mobile';
  model: string;
  effort: string;
  models: ModelInfo[];
  permissions: string;
  permissionProfiles: PermissionProfile[];
  onPermissionsChange: (permissions: string) => Promise<void>;
  projects?: ProjectInfo[];
  selectedProjectId?: string;
  activeTurnId?: string | null;
  focusRequest?: number;
  draftKey?: string;
  disabled?: boolean;
  placeholder?: string;
  onProjectChange?: (projectId: string) => void;
  onModelChange: (model: string) => void | Promise<void>;
  onEffortChange: (effort: string) => void | Promise<void>;
  onSubmit: (text: string, attachments: ComposerAttachment[]) => Promise<void>;
  contextUsage?: ContextUsage;
  onStop?: () => Promise<void>;
  onError: (error: unknown) => void;
}

export function Composer({
  variant, layout, model, effort, models, permissions, permissionProfiles, onPermissionsChange,
  projects = [], selectedProjectId = '', activeTurnId, focusRequest = 0,
  draftKey = variant, disabled = false, placeholder, onProjectChange,
  onModelChange, onEffortChange, onSubmit, onStop, onError, contextUsage
}: ComposerProps) {
  const [draft, setDraft] = useState(() => sessionStorage.getItem(`draft:${draftKey}`) ?? '');
  const [sending, setSending] = useState(false);
  const [changing, setChanging] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  const [listening, setListening] = useState(false);
  const [menu, setMenu] = useState<'settings' | 'models' | 'permissions' | 'projects' | null>(null);
  const [popoverStyle, setPopoverStyle] = useState<CSSProperties>({});
  const draftRef = useRef(draft);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  const permissionButtonRef = useRef<HTMLButtonElement>(null);
  const projectButtonRef = useRef<HTMLButtonElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<Dictation | null>(null);
  const speechConstructor = (window as SpeechWindow).SpeechRecognition ?? (window as SpeechWindow).webkitSpeechRecognition;
  const contextWindow = contextUsage?.modelContextWindow;
  const usedTokens = contextUsage?.last.totalTokens;
  const contextPercent = contextWindow && usedTokens != null
    ? Math.min(100, Math.max(0, usedTokens / contextWindow * 100)) : null;
  const modelInfo = models.find((entry) => entry.model === model);
  const effortOptions = useMemo(() => reasoningOptionsForModel(modelInfo), [modelInfo]);
  const menuLabel = menu === 'permissions' ? '访问权限' : menu === 'models' ? '模型' : menu === 'projects' ? '项目' : '推理强度';
  draftRef.current = draft;

  useEffect(() => () => { recognitionRef.current?.abort(); }, []);

  const dictate = () => {
    if (recognitionRef.current) { recognitionRef.current.stop(); return; }
    if (!speechConstructor) return;
    const recognition = new speechConstructor();
    recognitionRef.current = recognition;
    recognition.lang = document.documentElement.lang || navigator.language;
    recognition.interimResults = false;
    recognition.onstart = () => setListening(true);
    recognition.onend = () => { recognitionRef.current = null; setListening(false); };
    recognition.onerror = (event) => {
      if (event.error !== 'aborted') onError(new Error(event.error === 'not-allowed' ? '请允许浏览器使用麦克风。' : '听写暂时不可用，请重试。'));
    };
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results).map((result) => result[0]?.transcript ?? '').join('');
      setDraft((current) => {
        const next = `${current}${current && !/\s$/.test(current) ? ' ' : ''}${transcript}`;
        sessionStorage.setItem(`draft:${draftKey}`, next);
        return next;
      });
    };
    recognition.start();
  };

  const addFiles = async (files: FileList | null) => {
    try {
      const images = await Promise.all(Array.from(files ?? []).map(async (file) => {
        if (!file.type.startsWith('image/')) throw new Error('请选择图片文件。');
        if (file.size > 10 * 1024 * 1024) throw new Error('单张图片不能超过 10 MB。');
        const url = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error(`无法读取 ${file.name}`));
          reader.readAsDataURL(file);
        });
        return { id: crypto.randomUUID(), name: file.name, url };
      }));
      setAttachments((current) => [...current, ...images]);
    } catch (error) { onError(error); }
    finally { if (fileRef.current) fileRef.current.value = ''; }
  };
  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = '0px';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 180)}px`;
  }, [draft]);

  useEffect(() => {
    if (focusRequest > 0) textareaRef.current?.focus();
  }, [focusRequest]);

  const closeMenu = () => {
    const trigger = menu === 'permissions' ? permissionButtonRef.current : menu === 'projects' ? projectButtonRef.current : settingsButtonRef.current;
    setMenu(null);
    trigger?.focus({ preventScroll: true });
  };

  useEffect(() => {
    if (!menu) return;
    const dismiss = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!composerRef.current?.contains(target) && !popoverRef.current?.contains(target)) setMenu(null);
    };
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeMenu();
      }
    };
    window.addEventListener('pointerdown', dismiss);
    window.addEventListener('keydown', keydown, true);
    return () => {
      window.removeEventListener('pointerdown', dismiss);
      window.removeEventListener('keydown', keydown, true);
    };
  }, [menu]);

  useLayoutEffect(() => {
    if (!menu) return;
    const updatePosition = () => {
      if (layout === 'mobile') {
        const top = composerRef.current?.getBoundingClientRect().top ?? window.innerHeight - 118;
        setPopoverStyle({
          position: 'fixed', left: 8, right: 8, width: 'auto',
          bottom: window.innerHeight - top + 8,
          maxHeight: Math.min(window.innerHeight * .55, top - 16)
        });
        return;
      }
      const trigger = menu === 'permissions' ? permissionButtonRef.current : menu === 'projects' ? projectButtonRef.current : settingsButtonRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const alignStart = menu === 'permissions' || menu === 'projects';
      const width = Math.min(alignStart ? 296 : 224, window.innerWidth - 24);
      setPopoverStyle({
        position: 'fixed',
        left: Math.max(12, Math.min(alignStart ? rect.left : rect.right - width, window.innerWidth - width - 12)),
        width,
        bottom: window.innerHeight - rect.top + 8,
        maxHeight: Math.max(120, rect.top - 20)
      });
    };
    updatePosition();
    const frame = requestAnimationFrame(() => {
      const root = popoverRef.current;
      (root?.querySelector<HTMLButtonElement>('[aria-checked="true"]') ??
        root?.querySelector<HTMLButtonElement>('[role="menuitemradio"], [role="menuitem"]'))?.focus();
    });
    window.addEventListener('resize', updatePosition);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', updatePosition);
    };
  }, [layout, menu]);

  const changeSetting = async (action: () => void | Promise<void>) => {
    if (changing) return;
    setChanging(true);
    try {
      await action();
      closeMenu();
    } catch (error) {
      onError(error);
    } finally {
      setChanging(false);
    }
  };

  const submit = async () => {
    const text = draft.trim();
    if ((!text && attachments.length === 0) || sending || disabled) return;
    setSending(true);
    try {
      await onSubmit(text, attachments);
      setAttachments([]);
      if (draftRef.current.trim() === text) {
        setDraft('');
        sessionStorage.removeItem(`draft:${draftKey}`);
      }
    } catch (error) {
      onError(error);
    } finally {
      setSending(false);
    }
  };

  const stop = async () => {
    if (!onStop || stopping) return;
    setStopping(true);
    try { await onStop(); }
    catch (error) { onError(error); }
    finally { setStopping(false); }
  };

  return (
    <div className={`composer-wrap composer-wrap--${variant}`} ref={composerRef}>
      {menu && createPortal(
        <>
          <button type="button" className={`composer-menu-dismiss${layout === 'mobile' ? ' composer-popover-backdrop' : ''}`}
            aria-label="关闭菜单" onClick={closeMenu} tabIndex={-1} />
          <div ref={popoverRef}
            className={`composer-popover${layout === 'mobile' ? ' composer-popover--mobile' : ''}`}
            style={popoverStyle} role="menu"
            aria-label={menuLabel}
            onKeyDown={(event) => {
              const options = [...event.currentTarget.querySelectorAll<HTMLButtonElement>(
                '[role="menuitemradio"]:not(:disabled), [role="menuitem"]:not(:disabled)'
              )];
              const index = options.indexOf(document.activeElement as HTMLButtonElement);
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                options[(index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length]?.focus();
              }
              if (event.key === 'Home') { event.preventDefault(); options[0]?.focus(); }
              if (event.key === 'End') { event.preventDefault(); options.at(-1)?.focus(); }
              if (event.key === 'Tab' && layout === 'mobile') {
                const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
                if (event.shiftKey && document.activeElement === buttons[0]) {
                  event.preventDefault(); buttons.at(-1)?.focus();
                } else if (!event.shiftKey && document.activeElement === buttons.at(-1)) {
                  event.preventDefault(); buttons[0]?.focus();
                }
              } else if (event.key === 'Tab') setMenu(null);
            }}
          >
            <div className="popover-heading">
              {menu === 'models' && (
                <button type="button" className="icon-button icon-button--small" aria-label="返回推理强度"
                  title="返回推理强度" onClick={() => setMenu('settings')}><ArrowLeft size={15} /></button>
              )}
              <span>{menuLabel}</span>
              {layout === 'mobile' && <button type="button" className="icon-button" aria-label="关闭菜单" onClick={closeMenu}><X size={18} /></button>}
            </div>
            <div className="model-list">
              {menu === 'projects' ? (
                <>
                  <button type="button" role="menuitemradio" className="model-option project-option"
                    aria-checked={!selectedProjectId} onClick={() => void changeSetting(() => onProjectChange?.(''))}>
                    <MessageSquare size={15} /><span>无项目</span>{!selectedProjectId && <Check size={15} aria-hidden="true" />}
                  </button>
                  {projects.map((project) => (
                    <button type="button" role="menuitemradio" className="model-option project-option" key={project.id}
                      title={project.roots[0]?.path} aria-checked={project.id === selectedProjectId}
                      onClick={() => void changeSetting(() => onProjectChange?.(project.id))}>
                      <Folder size={15} /><span>{project.name}</span>{project.id === selectedProjectId && <Check size={15} aria-hidden="true" />}
                    </button>
                  ))}
                </>
              ) : menu === 'permissions' ? permissionProfiles.map((profile) => (
                <button type="button" role="menuitemradio" className="model-option" key={profile.id}
                  aria-checked={permissions === profile.id} disabled={changing || profile.allowed === false}
                  onClick={() => void changeSetting(() => onPermissionsChange(profile.id))}>
                  <span>{permissionLabel(profile.id)}</span>
                  {permissions === profile.id && <Check size={15} aria-hidden="true" />}
                </button>
              )) : menu === 'models' ? models.map((entry) => (
                <button type="button" role="menuitemradio" className="model-option" key={entry.id}
                  aria-checked={entry.model === model} title={entry.displayName} disabled={changing}
                  onClick={() => void changeSetting(() => onModelChange(entry.model))}>
                  <span>{modelDisplayName(models, entry.model)}</span>
                  {entry.model === model && <Check size={15} aria-hidden="true" />}
                </button>
              )) : effortOptions.map((option) => (
                <button type="button" role="menuitemradio" className="model-option" key={option.value}
                  aria-checked={option.value === effort} disabled={changing}
                  onClick={() => void changeSetting(() => onEffortChange(option.value))}>
                  <span>{option.label}</span>
                  {option.value === effort && <Check size={15} aria-hidden="true" />}
                </button>
              ))}
            </div>
            {menu === 'settings' && (
              <button type="button" role="menuitem" className="model-submenu-button" onClick={() => setMenu('models')}>
                <span>模型</span><span className="model-submenu-value">{modelDisplayName(models, model)}</span><ChevronRight size={15} />
              </button>
            )}
          </div>
        </>,
        document.body
      )}
      <div className="composer">
        {attachments.length > 0 && <div className="composer-context-tray">
          {attachments.map((attachment) => <div className="composer-context-chip" key={attachment.id}>
            <FileImage size={14} /><span>{attachment.name}</span>
            <button type="button" aria-label={`移除 ${attachment.name}`} onClick={() => setAttachments((current) => current.filter((image) => image.id !== attachment.id))}><X size={12} /></button>
          </div>)}
        </div>}
        <input type="file" ref={fileRef} hidden multiple accept="image/*"
          onChange={(event) => void addFiles(event.target.files)} />
        <label className="sr-only" htmlFor={`composer-${variant}`}>{variant === 'home' ? '输入任务内容' : '继续当前任务'}</label>
        <textarea id={`composer-${variant}`} ref={textareaRef} value={draft}
          onPaste={(event) => {
            if (sending || disabled) return;
            const files = event.clipboardData.files;
            if ([...files].some((file) => file.type.startsWith('image/'))) {
              event.preventDefault(); void addFiles(files);
            }
          }}
          onChange={(event) => {
            setDraft(event.target.value);
            sessionStorage.setItem(`draft:${draftKey}`, event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault(); void submit();
            }
          }}
          placeholder={placeholder ?? (activeTurnId ? '补充要求' : variant === 'home' ? '有什么需要处理？' : '继续向 Codex 提问')}
          rows={1}
        />
        <div className="composer-toolbar">
          <div className="composer-toolbar-left">
            <button type="button" className="composer-circle-button composer-add" aria-label="添加图片" title="添加图片"
              disabled={sending || disabled} onClick={() => fileRef.current?.click()}><Plus size={15} /></button>
            {variant === 'home' && projects.length > 0 && (
              <button type="button" ref={projectButtonRef} className="project-picker"
                aria-label="选择项目" aria-haspopup="menu" aria-expanded={menu === 'projects'}
                title={projects.find((project) => project.id === selectedProjectId)?.name ?? '选择项目'}
                onClick={() => setMenu((current) => current === 'projects' ? null : 'projects')}>
                <Folder size={15} aria-hidden="true" /><span className="sr-only">选择项目</span>
                <span className="project-picker-label">{projects.find((project) => project.id === selectedProjectId)?.name ?? '选择项目'}</span>
                <ChevronDown size={12} aria-hidden="true" />
              </button>
            )}
            <button type="button" ref={permissionButtonRef}
              className={`composer-permission${permissions === ':danger-full-access' ? ' composer-permission--full' : ''}`}
              aria-label={`访问权限：${permissionLabel(permissions)}`} title={permissionLabel(permissions)}
              aria-haspopup="menu" aria-expanded={menu === 'permissions'}
              disabled={disabled || permissionProfiles.length === 0}
              onClick={() => setMenu((current) => current === 'permissions' ? null : 'permissions')}>
              {permissions === ':read-only' ? <Eye size={15} /> : permissions === ':danger-full-access' ? <ShieldAlert size={15} /> : <ShieldCheck size={15} />}
              <span>{permissionLabel(permissions)}</span>
              <ChevronDown size={12} aria-hidden="true" />
            </button>
            <button type="button" className="composer-setting" ref={settingsButtonRef}
              aria-haspopup="menu" aria-expanded={menu === 'settings' || menu === 'models'} disabled={models.length === 0}
              onClick={() => setMenu((current) => current === 'settings' || current === 'models' ? null : 'settings')}
              aria-label={`${modelDisplayName(models, model)}，${reasoningLabel(modelInfo, effort)}`}
              title={`${modelDisplayName(models, model)} · ${reasoningLabel(modelInfo, effort)}`}>
              <span>{modelDisplayName(models, model)}</span>
              {effort && <span className="composer-effort">{reasoningLabel(modelInfo, effort)}</span>}
              <ChevronDown size={13} aria-hidden="true" />
            </button>
          </div>
          <div className="composer-submit">
            {contextPercent !== null && <span className="context-usage" role="img" tabIndex={0}
              aria-label={`上下文已用 ${Math.round(contextPercent)}%`}
              title={`上下文已用 ${Math.round(contextPercent)}%\n${usedTokens?.toLocaleString()} / ${contextWindow?.toLocaleString()} tokens`}
              style={{ '--context-percent': contextPercent } as CSSProperties}>
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                <circle className="context-usage-track" cx="6" cy="6" r="5" pathLength="100" />
                <circle className="context-usage-progress" cx="6" cy="6" r="5" pathLength="100" />
              </svg>
            </span>}
            {speechConstructor && <button type="button" className={`composer-circle-button${listening ? ' is-listening' : ''}`}
              aria-label={listening ? '停止听写' : '开始听写'} title={listening ? '停止听写' : '开始听写'}
              aria-pressed={listening} onClick={dictate}><Mic size={15} /></button>}
            {activeTurnId && !draft.trim() && attachments.length === 0 ? (
              <button type="button" className="composer-stop" disabled={stopping} onClick={() => void stop()}
                aria-label="停止任务" title="停止任务">
                {stopping ? <LoaderCircle size={16} className="spin" /> : <Square size={13} fill="currentColor" />}
              </button>
            ) : (
              <button type="button" className="composer-send" disabled={(!draft.trim() && attachments.length === 0) || sending || disabled}
                onClick={() => void submit()} aria-label={activeTurnId ? '发送补充要求' : '发送任务'}
                title={activeTurnId ? '发送补充要求' : '发送任务'}>
                {sending ? <LoaderCircle size={17} className="spin" /> : <ArrowUp size={18} />}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

interface Dictation {
  lang: string;
  interimResults: boolean;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type SpeechWindow = Window & {
  SpeechRecognition?: new () => Dictation;
  webkitSpeechRecognition?: new () => Dictation;
};
