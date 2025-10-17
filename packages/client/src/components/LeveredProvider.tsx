"use client";

import { createContext, useContext, ReactNode } from "react";

interface LeveredContextType {
  publicKey: string;
  apiEndpoint: string;
}

const LeveredContext = createContext<LeveredContextType | undefined>(undefined);

export const useLevered = () => {
  const context = useContext(LeveredContext);
  if (!context) {
    throw new Error("useLevered must be used within a LeveredProvider");
  }
  return context;
};

interface LeveredProviderProps {
  publicKey: string;
  apiEndpoint: string;
  children: ReactNode;
}

export const LeveredProvider = ({
  publicKey,
  apiEndpoint,
  children,
}: LeveredProviderProps) => {
  const value = { publicKey, apiEndpoint };

  return (
    <LeveredContext.Provider value={value}>{children}</LeveredContext.Provider>
  );
};
