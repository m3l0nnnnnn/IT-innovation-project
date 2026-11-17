import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

type Props = { children: ReactNode };
type State = { hasError: boolean };

/** Keep an unexpected page crash from blanking the whole Estara workspace. */
export default class PageErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Estara page failed to render:', error, info.componentStack);
  }

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;

    return <section className="card" role="alert" style={{ maxWidth: 680, margin: '36px auto', padding: 28 }}>
      <h2>Unable to display this page</h2>
      <p>An unexpected error occurred. Return to the dashboard, or check the browser Console if it happens again.</p>
      <Link className="primary-button" to="/">Return to dashboard</Link>
    </section>;
  }
}
