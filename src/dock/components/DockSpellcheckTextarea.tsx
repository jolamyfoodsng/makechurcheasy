import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEventHandler,
  type TextareaHTMLAttributes,
} from "react";
import { useTranslation } from "react-i18next";
import Icon from "../DockIcon";
import {
  DOCK_SPELLCHECK_DICTIONARY_UPDATED_EVENT,
  loadDockSpellcheckDictionary,
  saveDockSpellcheckDictionary,
} from "../dockSpellcheckDictionary";
import {
  findDockSpellingErrors,
  getCaseMatchedSuggestion,
  normalizeIgnoredSpellcheckWords,
  replaceDockSpellingErrors,
  type DockSpellcheckError,
} from "../spellcheckService";

interface DockSpellcheckTextareaProps
  extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "onChange" | "value" | "spellCheck"> {
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: KeyboardEventHandler<HTMLTextAreaElement>;
}

function renderSpellingHighlights(value: string, errors: DockSpellcheckError[]) {
  if (!value) return " ";

  const parts: React.ReactNode[] = [];
  let cursor = 0;

  errors.forEach((error, index) => {
    if (error.start > cursor) {
      parts.push(<span key={`text-${index}`}>{value.slice(cursor, error.start)}</span>);
    }
    parts.push(
      <mark key={`error-${error.start}-${error.end}`} title={error.suggestions[0] ? `Suggestion: ${error.suggestions[0]}` : "Spelling suggestion unavailable"}>
        {value.slice(error.start, error.end)}
      </mark>,
    );
    cursor = error.end;
  });

  if (cursor < value.length) parts.push(<span key="text-end">{value.slice(cursor)}</span>);
  return parts;
}

export default function DockSpellcheckTextarea({
  value,
  onChange,
  onKeyDown,
  className = "",
  id,
  "aria-describedby": ariaDescribedBy,
  ...textareaProps
}: DockSpellcheckTextareaProps) {
  const { t } = useTranslation();
  const generatedId = useId();
  const statusId = `${id ?? generatedId}-spellcheck-status`;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);
  const [errors, setErrors] = useState<DockSpellcheckError[]>([]);
  const [checkedText, setCheckedText] = useState("");
  const [ignoredWords, setIgnoredWords] = useState<Set<string>>(() => loadDockSpellcheckDictionary());
  const [isChecking, setIsChecking] = useState(false);
  const [dictionaryError, setDictionaryError] = useState(false);

  useEffect(() => {
    const reloadDictionary = () => setIgnoredWords(loadDockSpellcheckDictionary());
    window.addEventListener(DOCK_SPELLCHECK_DICTIONARY_UPDATED_EVENT, reloadDictionary);
    return () => window.removeEventListener(DOCK_SPELLCHECK_DICTIONARY_UPDATED_EVENT, reloadDictionary);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (!value.trim()) {
        setErrors([]);
        setCheckedText(value);
        setIsChecking(false);
        return;
      }

      setIsChecking(true);
      void findDockSpellingErrors(value, ignoredWords)
        .then((nextErrors) => {
          if (cancelled) return;
          setErrors(nextErrors);
          setCheckedText(value);
          setDictionaryError(false);
          setIsChecking(false);
        })
        .catch(() => {
          if (cancelled) return;
          setErrors([]);
          setCheckedText(value);
          setDictionaryError(true);
          setIsChecking(false);
        });
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [ignoredWords, value]);

  const syncMirrorScroll = useCallback(() => {
    if (!textareaRef.current || !mirrorRef.current) return;
    mirrorRef.current.scrollTop = textareaRef.current.scrollTop;
    mirrorRef.current.scrollLeft = textareaRef.current.scrollLeft;
  }, []);

  useEffect(() => {
    syncMirrorScroll();
  }, [checkedText, errors, syncMirrorScroll]);

  const replaceError = useCallback((error: DockSpellcheckError, suggestion?: string) => {
    const replacement = suggestion
      ? (error.word === error.word.toLocaleUpperCase()
        ? suggestion.toLocaleUpperCase()
        : error.word.length > 0 && error.word[0] === error.word[0].toLocaleUpperCase()
          ? `${suggestion.charAt(0).toLocaleUpperCase()}${suggestion.slice(1).toLocaleLowerCase()}`
          : suggestion.toLocaleLowerCase())
      : getCaseMatchedSuggestion(error);
    if (!replacement) return;

    onChange(`${value.slice(0, error.start)}${replacement}${value.slice(error.end)}`);
    setErrors([]);
    setCheckedText("");
  }, [onChange, value]);

  const ignoreWord = useCallback((word: string) => {
    const nextIgnoredWords = new Set(ignoredWords);
    nextIgnoredWords.add(word.toLocaleLowerCase());
    setIgnoredWords(saveDockSpellcheckDictionary(nextIgnoredWords));
    setErrors((current) => current.filter((error) => error.word.toLocaleLowerCase() !== word.toLocaleLowerCase()));
  }, [ignoredWords]);

  const clearAllErrors = useCallback(() => {
    const withoutSuggestions = errors.filter((error) => !error.suggestions[0]);
    const correctedText = replaceDockSpellingErrors(value, errors);
    if (correctedText !== value) onChange(correctedText);
    if (withoutSuggestions.length > 0) {
      const nextIgnoredWords = normalizeIgnoredSpellcheckWords([
        ...ignoredWords,
        ...withoutSuggestions.map((error) => error.word),
      ]);
      setIgnoredWords(saveDockSpellcheckDictionary(nextIgnoredWords));
    }
    setErrors([]);
    setCheckedText("");
  }, [errors, ignoredWords, onChange, value]);

  const visibleErrors = checkedText === value ? errors : [];
  const statusText = dictionaryError
    ? t("spellcheck.unavailable", { defaultValue: "Spell checking unavailable" })
    : isChecking
      ? t("spellcheck.checking", { defaultValue: "Checking spelling…" })
      : visibleErrors.length > 0
        ? t("spellcheck.errorCount", { count: visibleErrors.length, defaultValue: `Spelling issues: ${visibleErrors.length}` })
        : t("spellcheck.noErrors", { defaultValue: "No spelling errors" });
  const describedBy = [ariaDescribedBy, statusId].filter(Boolean).join(" ");

  return (
    <div className="dock-spellcheck">
      <div className="dock-spellcheck__editor">
        <div
          ref={mirrorRef}
          className="dock-spellcheck__mirror"
          aria-hidden="true">
          {renderSpellingHighlights(value, visibleErrors)}
        </div>
        <textarea
          {...textareaProps}
          id={id}
          ref={textareaRef}
          className={`dock-spellcheck__textarea ${className}`.trim()}
          value={value}
          spellCheck={false}
          aria-invalid={visibleErrors.length > 0}
          aria-describedby={describedBy || undefined}
          onScroll={syncMirrorScroll}
          onKeyDown={onKeyDown}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
      <div className={`dock-spellcheck__toolbar${visibleErrors.length > 0 ? " dock-spellcheck__toolbar--errors" : ""}`}>
        <span id={statusId} className="dock-spellcheck__status" role="status" aria-live="polite">
          {statusText}
        </span>
        {visibleErrors.length > 0 && (
          <button
            type="button"
            className="dock-spellcheck__action dock-spellcheck__action--primary"
            onClick={clearAllErrors}
            title={t("spellcheck.clearAll", { defaultValue: "Correct all spelling errors" })}>
            <Icon name="auto_fix_high" size={12} />
            <span>{t("spellcheck.clearAll", { defaultValue: "Clear all errors" })}</span>
          </button>
        )}
      </div>
      {visibleErrors.length > 0 && (
        <div className="dock-spellcheck__suggestions" role="group" aria-label={t("spellcheck.corrections", { defaultValue: "Spelling corrections" })}>
          {visibleErrors.slice(0, 8).map((error) => {
            const suggestion = error.suggestions[0];
            return (
              <div className="dock-spellcheck__suggestion" key={`${error.start}-${error.end}-${error.word}`}>
                <span className="dock-spellcheck__word">{error.word}</span>
                {suggestion ? (
                  <button
                    type="button"
                    className="dock-spellcheck__suggestion-btn"
                    onClick={() => replaceError(error, suggestion)}
                    title={t("spellcheck.useSuggestion", { suggestion, defaultValue: `Use ${suggestion}` })}>
                    {getCaseMatchedSuggestion(error)}
                  </button>
                ) : (
                  <span className="dock-spellcheck__no-suggestion">{t("spellcheck.noSuggestion", { defaultValue: "No suggestion" })}</span>
                )}
                <button
                  type="button"
                  className="dock-spellcheck__ignore"
                  onClick={() => ignoreWord(error.word)}
                  aria-label={t("spellcheck.dismissWord", { word: error.word, defaultValue: `Dismiss ${error.word}` })}
                  title={t("spellcheck.dismissWord", { word: error.word, defaultValue: `Dismiss ${error.word}` })}>
                  <Icon name="close" size={11} />
                  <span>{t("spellcheck.dismiss", { defaultValue: "Dismiss" })}</span>
                </button>
              </div>
            );
          })}
          {visibleErrors.length > 8 && (
            <span className="dock-spellcheck__more">
              {t("spellcheck.moreErrors", { count: visibleErrors.length - 8, defaultValue: `+${visibleErrors.length - 8} more` })}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
