import { useEffect, useRef } from "react";

export const useSyncedRef = (value) => {
  const valueRef = useRef(value);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  return valueRef;
};
