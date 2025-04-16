import React, { createContext, useState, useContext } from 'react';

// Create a context for loading states
const LoadingContext = createContext({
  isLoading: false,
  setLoading: () => {},
  loadingMessage: '',
  setLoadingMessage: () => {},
  loadingProgress: 0,
  setLoadingProgress: () => {}
});

// Custom hook to use the loading context
export const useLoading = () => useContext(LoadingContext);

// Provider component that wraps your app and makes loading state available
export const LoadingProvider = ({ children }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [loadingProgress, setLoadingProgress] = useState(0);

  // Helper function to set loading state with options
  const setLoading = (loading, message = '', progress = 0) => {
    setIsLoading(loading);
    setLoadingMessage(message);
    setLoadingProgress(progress);
  };

  return (
    <LoadingContext.Provider
      value={{
        isLoading,
        setLoading,
        loadingMessage,
        setLoadingMessage,
        loadingProgress,
        setLoadingProgress
      }}
    >
      {children}
    </LoadingContext.Provider>
  );
};

export default LoadingContext;