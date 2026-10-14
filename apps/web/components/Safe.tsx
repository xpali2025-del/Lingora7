'use client';
import { Component, type ReactNode } from 'react';
/** Isolates client islands: a failure in reviews/checkout widgets must never remove the page content. */
export default class Safe extends Component<{ children: ReactNode; fallback?: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(e: unknown) { console.error('island failed', e); }
  render() { return this.state.failed ? (this.props.fallback ?? null) : this.props.children; }
}
