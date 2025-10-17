"use client";

import { useEffect, useState } from "react";
import { useLevered } from "./LeveredProvider";
import JsxParser from "react-jsx-parser";

interface LeveredComponentProps {
  componentId: string;
}

export const LeveredComponent = ({ componentId }: LeveredComponentProps) => {
  const { publicKey, apiEndpoint } = useLevered();
  const [componentCode, setComponentCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const fetchComponent = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(
          `${apiEndpoint}/api/v1/components/${componentId}/variants/live`,
          {
            headers: {
              "X-Api-Key": publicKey,
            },
          }
        );

        if (!response.ok) {
          throw new Error(`Failed to fetch component: ${response.statusText}`);
        }

        const data = await response.json();
        setComponentCode(data.code); // Assuming the API returns { code: '...' }
      } catch (e) {
        setError(e as Error);
      } finally {
        setLoading(false);
      }
    };

    fetchComponent();
  }, [componentId, publicKey, apiEndpoint]);

  if (loading) {
    return null; // Render a loading spinner or fallback UI
  }

  if (error) {
    console.error(`Levered SDK Error:`, error);
    return null; // Render null or an error boundary
  }

  if (!componentCode) {
    return null;
  }

  return <JsxParser jsx={componentCode} />;
};
