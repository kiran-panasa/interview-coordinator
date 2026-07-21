import { Component } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { logError } from "../utils/logger";
import Button from "./Button";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    logError(error, { label: "ErrorBoundary", componentStack: info.componentStack });
  }

  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback(this.state.error);
      return (
        <div className="flex flex-col items-center justify-center min-h-[400px] p-8 text-center animate-fade-in">
          <div className="w-full max-w-sm flex flex-col items-center bg-white border border-gray-100 rounded-2xl shadow-card px-8 py-10">
            <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mb-4">
              <AlertTriangle className="w-6 h-6 text-red-400" strokeWidth={1.8} />
            </div>
            <p className="text-gray-900 font-semibold mb-1">Something went wrong</p>
            <p className="text-sm text-gray-400 mb-6 max-w-xs">
              {this.state.error.message || "An unexpected error occurred."}
            </p>
            <Button
              variant="primary"
              icon={RotateCcw}
              onClick={() => this.setState({ error: null })}
            >
              Try again
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
