import { Component, ReactNode } from "react";

interface Props { children: ReactNode; }
interface State { error: Error | null; }

class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: any) {
    // eslint-disable-next-line no-console
    console.error("ErrorBoundary caught:", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-6">
          <div className="max-w-md w-full glass-card rounded-2xl p-6 space-y-3">
            <h2 className="text-lg font-display font-semibold text-foreground">Something went wrong</h2>
            <p className="text-sm text-muted-foreground break-words">{this.state.error.message}</p>
            <button
              onClick={() => { this.setState({ error: null }); window.location.href = "/"; }}
              className="text-sm underline text-foreground"
            >
              Go home
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
