import { useCallback, useEffect, useState } from "react";

export function useResource(fn, deps) {
  const [state, setState] = useState({
    data: null,
    loading: true,
    error: null,
  });

  const load = useCallback((silent = false) => {
    setState((s) => ({
      ...s,
      loading: s.data === null ? true : !silent,
      error: null,
    }));
    return fn()
      .then((data) => {
        setState({ data, loading: false, error: null });
        return data;
      })
      .catch((e) => {
        setState((s) => ({ ...s, loading: false, error: e.message }));
        throw e;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps || []);

  useEffect(() => {
    load();
  }, [load]);

  return [state, load];
}
