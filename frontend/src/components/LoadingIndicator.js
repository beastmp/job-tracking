import React from 'react';
import { useLoading } from '../contexts/LoadingContext';

const LoadingIndicator = () => {
  const { isLoading, loadingMessage, loadingProgress } = useLoading();

  if (!isLoading) return null;

  return (
    <div className="loading-overlay" style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 9999,
      flexDirection: 'column',
      textAlign: 'center'
    }}>
      <div className="loading-content" style={{
        backgroundColor: 'white',
        padding: '30px',
        borderRadius: '8px',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
        maxWidth: '80%',
        width: '400px'
      }}>
        <div className="spinner-border text-primary" style={{ width: '3rem', height: '3rem' }} role="status">
          <span className="visually-hidden">Loading...</span>
        </div>

        {loadingMessage && (
          <div className="loading-message mt-3 mb-2">
            <h5>{loadingMessage}</h5>
          </div>
        )}

        {loadingProgress > 0 && (
          <div className="progress mt-3" style={{ height: '10px' }}>
            <div
              className="progress-bar progress-bar-striped progress-bar-animated"
              style={{ width: `${loadingProgress}%` }}
              role="progressbar"
              aria-valuenow={loadingProgress}
              aria-valuemin="0"
              aria-valuemax="100">
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default LoadingIndicator;