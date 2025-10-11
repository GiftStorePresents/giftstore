// src/components/PageViewTracker.js
import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { trackPageView } from "../utils/analytics";

export default function PageViewTracker() {
  const location = useLocation();

  useEffect(() => {
    trackPageView({ path: location.pathname + location.search });
  }, [location]);

  return null;
}
