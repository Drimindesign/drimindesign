"use client";

import { Component, type ReactNode } from "react";

/** Let the section restore its HTML presentation after a renderer or asset failure. */
export class WebglBoundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } { return { failed: true }; }
  componentDidCatch(): void { this.props.onError(); }
  render(): ReactNode { return this.state.failed ? null : this.props.children; }
}
