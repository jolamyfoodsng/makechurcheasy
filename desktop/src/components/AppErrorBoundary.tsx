/**
 * AppErrorBoundary.tsx — MakeChurchEasy
 *
 * Catches runtime React exceptions and dynamic module chunk loading errors,
 * rendering a clean, brand-aligned fallback UI with recovery actions instead of
 * raw React Router developer error pages.
 */

import React, { Component, type ReactNode } from "react";
import Icon from "./Icon";
import "./AppErrorBoundary.css";

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
  showDetails: boolean;
  copied: boolean;
  isChunkError: boolean;
}

export class AppErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
    showDetails: false,
    copied: false,
    isChunkError: false,
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    const message = error?.message || "";
    const isChunk =
      message.includes("Importing a module script failed") ||
      message.includes("Failed to fetch dynamically imported module") ||
      message.includes("dynamically imported module");

    return {
      hasError: true,
      error,
      isChunkError: isChunk,
    };
  }

  public componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("[MakeChurchEasy] Unhandled application error caught by AppErrorBoundary:", error, errorInfo);
    this.setState({ errorInfo });

    // Auto-reload on stale chunk hashes if not recently reloaded
    const isChunk =
      error?.message?.includes("Importing a module script failed") ||
      error?.message?.includes("Failed to fetch dynamically imported module");

    if (isChunk) {
      const reloadKey = "mce_chunk_error_reload_" + Math.floor(Date.now() / 15000);
      if (!sessionStorage.getItem(reloadKey)) {
        sessionStorage.setItem(reloadKey, "1");
        console.warn("[MakeChurchEasy] Stale chunk detected, refreshing page automatically...");
        window.location.reload();
      }
    }
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleGoHome = () => {
    window.location.href = "/";
  };

  private handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: false,
      copied: false,
      isChunkError: false,
    });
    this.props.onReset?.();
  };

  private handleCopyError = () => {
    const { error, errorInfo } = this.state;
    const text = [
      `MakeChurchEasy Application Error Report`,
      `Timestamp: ${new Date().toISOString()}`,
      `URL: ${window.location.href}`,
      `Error: ${error?.name ?? "Error"}: ${error?.message ?? "Unknown error"}`,
      `Stack:\n${error?.stack ?? "No stack trace available"}`,
      `Component Stack:\n${errorInfo?.componentStack ?? "No component stack"}`,
    ].join("\n\n");

    navigator.clipboard.writeText(text).then(() => {
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 2500);
    }).catch(() => {});
  };

  public render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const { error, errorInfo, showDetails, copied, isChunkError } = this.state;
    const title = this.props.fallbackTitle ?? (isChunkError ? "App Update Available" : "Something Went Wrong");
    const description = isChunkError
      ? "A new version of MakeChurchEasy or a module chunk was updated. Reloading will fetch the latest version."
      : "An unexpected error occurred in this view. Your saved songs, themes, and service plans remain safe.";

    return (
      <div className="mce-error-boundary-page" role="alert">
        <div className="mce-error-boundary-card">
          <div className="mce-error-boundary-header">
            <div className="mce-error-boundary-icon">
              <Icon name={isChunkError ? "update" : "warning"} size={28} />
            </div>
            <div className="mce-error-boundary-brand">
              <span className="mce-error-boundary-app-name">MakeChurchEasy</span>
              <span className="mce-error-boundary-tag">Application Recovery</span>
            </div>
          </div>

          <div className="mce-error-boundary-body">
            <h2 className="mce-error-boundary-title">{title}</h2>
            <p className="mce-error-boundary-copy">{description}</p>

            <div className="mce-error-boundary-actions">
              <button
                type="button"
                className="mce-error-btn mce-error-btn--primary"
                onClick={this.handleReload}
              >
                <Icon name="refresh" size={16} />
                {isChunkError ? "Update & Reload" : "Reload App"}
              </button>

              <button
                type="button"
                className="mce-error-btn mce-error-btn--secondary"
                onClick={this.handleReset}
              >
                <Icon name="replay" size={16} />
                Try Again
              </button>

              <button
                type="button"
                className="mce-error-btn mce-error-btn--secondary"
                onClick={this.handleGoHome}
              >
                <Icon name="home" size={16} />
                Go to Home
              </button>
            </div>

            <div className="mce-error-boundary-details-section">
              <button
                type="button"
                className="mce-error-details-toggle"
                onClick={() => this.setState({ showDetails: !showDetails })}
                aria-expanded={showDetails}
              >
                <Icon name={showDetails ? "expand_less" : "expand_more"} size={16} />
                <span>{showDetails ? "Hide Error Details" : "View Technical Details"}</span>
              </button>

              {showDetails && (
                <div className="mce-error-details-box">
                  <div className="mce-error-details-toolbar">
                    <span className="mce-error-details-label">Error Summary</span>
                    <button
                      type="button"
                      className="mce-error-copy-btn"
                      onClick={this.handleCopyError}
                    >
                      <Icon name={copied ? "check" : "content_copy"} size={13} />
                      {copied ? "Copied!" : "Copy Report"}
                    </button>
                  </div>
                  <pre className="mce-error-code">
                    {error?.name}: {error?.message}
                    {"\n\n"}
                    {error?.stack}
                    {"\n\n"}
                    Component Stack:
                    {errorInfo?.componentStack}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }
}

export default AppErrorBoundary;
